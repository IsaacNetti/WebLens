import AxeBuilder from '@axe-core/playwright';
import axeCore from 'axe-core';
import { chromium, type BrowserContext, type Page } from 'playwright';

import { aggregateAccessibility } from '@/lib/accessibility';
import { addScanLog, completeScan, failScan, getScan, setScanStatus, updateProgress } from '@/lib/scan-store';
import { aggregateSeo, analyzeSeoForPage, getSeoRuleIdsThatFailed } from '@/lib/seo';
import { AxeRuleResult, FinalScanResult, PageAnalysisResult, SeoDomSnapshot } from '@/lib/types';
import type { AxeResults } from 'axe-core';
import { normalizeCrawlUrl, shouldVisitLink } from '@/lib/url';

const PAGE_TIMEOUT_MS = 30_000;

export async function runSiteScan(scanId: string): Promise<void> {
  const scan = getScan(scanId);

  if (!scan) {
    return;
  }

  setScanStatus(scanId, 'running', 'starting');
  addScanLog(scanId, 'starting', `Starting scan for ${scan.targetUrl}`);
  addScanLog(scanId, 'launching-browser', 'Launching Chromium through Playwright.');

  // A single browser/context per scan keeps the implementation simple.
  // A more advanced version might pool browsers or parallelize page work.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    const origin = new URL(scan.targetUrl).origin;
    // Breadth-first queue keeps the crawl logic beginner-readable.
    const queue: string[] = [scan.targetUrl];
    const discovered = new Set<string>([scan.targetUrl]);
    const analyzedPages: PageAnalysisResult[] = [];

    updateProgress(scanId, {
      pagesDiscovered: discovered.size,
      pagesScanned: 0
    });

    addScanLog(
      scanId,
      'discovering-pages',
      `Seeded the crawl queue with the starting page. Up to ${scan.maxPages} internal pages will be analyzed.`
    );

    while (queue.length > 0 && analyzedPages.length < scan.maxPages) {
      const nextUrl = queue.shift();

      if (!nextUrl) {
        break;
      }

      setScanStatus(scanId, 'running', 'analyzing-page', nextUrl);
      addScanLog(scanId, 'analyzing-page', `Page analysis started for ${nextUrl}`);

      // Each page is processed sequentially so the status log reads clearly
      // and the server work is easier to understand.
      const result = await analyzeSinglePage(context, nextUrl, origin, scanId);
      analyzedPages.push(result);

      for (const discoveredLink of result.discoveredLinks) {
        if (discovered.has(discoveredLink)) {
          continue;
        }

        discovered.add(discoveredLink);
        queue.push(discoveredLink);
      }

      updateProgress(scanId, {
        pagesDiscovered: discovered.size,
        pagesScanned: analyzedPages.length,
        currentPage: nextUrl
      });

      addScanLog(
        scanId,
        'discovering-pages',
        `Queue now has ${queue.length} pending pages. ${analyzedPages.length} page(s) analyzed so far.`
      );
    }

    addScanLog(scanId, 'aggregating-results', 'Aggregating site-wide SEO and accessibility results.');
    setScanStatus(scanId, 'running', 'aggregating-results');

    const successfulPages = analyzedPages.filter((page) => !page.error);
    const seo = aggregateSeo(successfulPages.map((page) => page.seo));
    const accessibility = aggregateAccessibility(successfulPages);

    const finalResult: FinalScanResult = {
      domain: scan.domain,
      targetUrl: scan.targetUrl,
      pagesDiscovered: discovered.size,
      pagesScanned: analyzedPages.length,
      seo,
      accessibility,
      pages: analyzedPages.map((page) => ({
        url: page.url,
        title: page.title,
        seoFailedRuleIds: page.error ? [] : getSeoRuleIdsThatFailed(page.seo),
        axeViolationCount: page.accessibility.violations.length,
        axePassCount: page.accessibility.passes.length,
        discoveredLinks: page.discoveredLinks.length,
        error: page.error,
        accessibilityError: page.accessibilityError
      })),
      technical: {
        crawlRules: [
          'The crawl starts at the submitted URL.',
          'Only same-origin internal links are added to the queue.',
          'Obvious non-HTML assets are skipped based on file extension.',
          'Duplicate URLs are ignored after normalization.',
          `The scan stops after ${scan.maxPages} analyzed pages.`
        ],
        libraries: [
          'Next.js route handlers are used for start and polling endpoints.',
          'Playwright loads pages in a real browser context and executes page scripts.',
          '@axe-core/playwright runs axe-core in the page using the official Playwright integration.',
          'Tailwind CSS handles the UI styling with a restrained default look.'
        ],
        scoringMethod: [seo.scoringNote, accessibility.scoringNote],
        limitations: [
          'This version scans sequentially, which is slower than a concurrent worker design but easier to read and reason about.',
          'Only public same-origin pages discovered from crawled links are included.',
          'The validator blocks obvious local/private hostnames but does not fully solve SSRF or DNS-based private-network edge cases.',
          'axe-core covers automated accessibility checks only. Manual review is still needed.',
          'The in-memory scan store is local-process state and is not durable across restarts.'
        ]
      }
    };

    completeScan(scanId, finalResult);
    await context.close();
    await browser.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected scanner failure.';
    failScan(scanId, message);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function analyzeSinglePage(
  context: BrowserContext,
  targetUrl: string,
  origin: string,
  scanId: string
): Promise<PageAnalysisResult> {
  const page = await context.newPage();

  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS
    });

    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

    const pageState = await page.evaluate(() => document.readyState).catch(() => 'unavailable');
    addScanLog(
      scanId,
      'analyzing-page',
      `Page loaded successfully for ${targetUrl}. Final URL: ${page.url()}. readyState: ${pageState}. Frames detected: ${page.frames().length}.`
    );

    // Collect the page data we need for SEO checks and future crawling first.
    // This lets SEO succeed even if accessibility tooling fails later.
    const dom = await page.evaluate(() => {
      const title = document.title ?? '';
      const metaDescription =
        document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.trim() ?? '';
      const h1Count = document.querySelectorAll('h1').length;
      const h2Count = document.querySelectorAll('h2').length;
      const textContentLength = document.body?.innerText?.replace(/\s+/g, ' ').trim().length ?? 0;
      const lang = document.documentElement.getAttribute('lang')?.trim() ?? '';
      const canonical =
        document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href?.trim() ?? '';
      const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content?.toLowerCase() ?? '';
      const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content?.trim() ?? '';
      const openGraphTitle =
        document.querySelector<HTMLMetaElement>('meta[property="og:title"], meta[name="og:title"]')?.content?.trim() ?? '';
      const openGraphDescription =
        document.querySelector<HTMLMetaElement>('meta[property="og:description"], meta[name="og:description"]')?.content?.trim() ?? '';
      const hasStructuredData =
        Boolean(document.querySelector('script[type="application/ld+json"]')) ||
        Boolean(document.querySelector('[itemscope], [itemtype*="schema.org"], [itemprop]'));
      const images = [...document.querySelectorAll('img')];
      const imagesMissingAlt = images.filter((image) => !image.hasAttribute('alt') || !image.getAttribute('alt')?.trim()).length;
      const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
        .map((anchor) => anchor.href)
        .filter(Boolean);

      return {
        title,
        metaDescription,
        h1Count,
        h2Count,
        textContentLength,
        lang,
        canonical,
        hasNoindex: robots.includes('noindex'),
        imageCount: images.length,
        imagesMissingAlt,
        internalLinkCount: 0,
        viewport,
        hasStructuredData,
        openGraphTitle,
        openGraphDescription,
        links
      } satisfies SeoDomSnapshot & { links: string[] };
    });

    addScanLog(
      scanId,
      'analyzing-page',
      `DOM snapshot collected for ${page.url()}. Title length: ${dom.title.length}. Images: ${dom.imageCount}. Links discovered before filtering: ${dom.links.length}.`
    );

    const currentUrl = page.url();
    const normalizedCurrent = normalizeCrawlUrl(currentUrl) ?? currentUrl;
    const discoveredLinks = dom.links
      .map((link) => normalizeCrawlUrl(link))
      .filter((link): link is string => Boolean(link))
      .filter((link) => shouldVisitLink(link, origin))
      .filter((link) => link !== normalizedCurrent);

    // The DOM snapshot is collected before crawl-link filtering, so we add the
    // final internal-link count here after same-origin filtering is complete.
    const seoResult = analyzeSeoForPage(normalizedCurrent, dom.title || normalizedCurrent, {
      ...dom,
      internalLinkCount: discoveredLinks.length
    });

    addScanLog(
      scanId,
      'analyzing-page',
      `SEO analysis completed for ${normalizedCurrent}. Internal crawl links kept: ${discoveredLinks.length}.`
    );

    let accessibility: PageAnalysisResult['accessibility'] = {
      violations: [],
      passes: []
    };
    let accessibilityError: string | undefined;

    addScanLog(
      scanId,
      'analyzing-page',
      `Accessibility analysis starting for ${normalizedCurrent}. Page closed: ${page.isClosed()}. Main frame URL: ${page.mainFrame().url()}. Frames: ${page.frames().length}.`
    );

    try {
      const axeRun = await runAxeOnPage(page);
      accessibility = {
        violations: axeRun.results.violations.map(minifyAxeRule),
        passes: axeRun.results.passes.map(minifyAxeRule)
      };

      addScanLog(
        scanId,
        'analyzing-page',
        `Accessibility analysis completed for ${normalizedCurrent}. violations=${axeRun.results.violations.length}, passes=${axeRun.results.passes.length}, incomplete=${axeRun.results.incomplete.length}, inapplicable=${axeRun.results.inapplicable.length}, durationMs=${axeRun.durationMs}.`
      );
    } catch (error) {
      accessibilityError = formatAxeError(normalizedCurrent, error);

      addScanLog(scanId, 'analyzing-page', accessibilityError);
    }

    return {
      url: normalizedCurrent,
      title: dom.title || normalizedCurrent,
      discoveredLinks,
      seo: seoResult,
      accessibility,
      accessibilityError
    };
  } catch (error) {
    const safeUrl = normalizeCrawlUrl(targetUrl) ?? targetUrl;
    const message = error instanceof Error ? error.message : 'Page analysis failed.';

    addScanLog(
      scanId,
      'analyzing-page',
      `Page analysis failed for ${safeUrl}. ${formatErrorDetails(error, 'page-analysis')}`
    );

    return {
      url: safeUrl,
      title: safeUrl,
      discoveredLinks: [],
      // If a page fails to load or the DOM cannot be collected, we return an
      // error result instead of crashing the whole site scan.
      seo: analyzeSeoForPage(safeUrl, safeUrl, {
        title: '',
        metaDescription: '',
        h1Count: 0,
        h2Count: 0,
        textContentLength: 0,
        lang: '',
        canonical: '',
        hasNoindex: false,
        imageCount: 0,
        imagesMissingAlt: 0,
        internalLinkCount: 0,
        viewport: '',
        hasStructuredData: false,
        openGraphTitle: '',
        openGraphDescription: ''
      }),
      accessibility: {
        violations: [],
        passes: []
      },
      error: message
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runAxeOnPage(page: Page): Promise<{
  results: Pick<AxeResults, 'violations' | 'passes' | 'incomplete' | 'inapplicable'>;
  durationMs: number;
}> {
  const startedAt = Date.now();

  let builder: AxeBuilder;

  try {
    // In a Next.js server runtime, the package's automatic axe source lookup can
    // fail because the bundled module path is not always a normal absolute file
    // path. Passing axeCore.source directly keeps the official Playwright
    // integration, but removes that fragile path-resolution step.
    builder = new AxeBuilder({
      page,
      axeSource: axeCore.source
    }).options({
      resultTypes: ['violations', 'passes', 'incomplete', 'inapplicable']
    });
  } catch (error) {
    throw new Error(formatErrorDetails(error, 'before-analyze'));
  }

  let results: AxeResults;

  try {
    results = await builder.analyze();
  } catch (error) {
    throw new Error(formatErrorDetails(error, 'during-analyze'));
  }

  try {
    return {
      results: {
        violations: results.violations ?? [],
        passes: results.passes ?? [],
        incomplete: results.incomplete ?? [],
        inapplicable: results.inapplicable ?? []
      },
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    throw new Error(formatErrorDetails(error, 'transforming-results'));
  }
}

function minifyAxeRule(rule: {
  id: string;
  help: string;
  description: string;
  impact?: string | null;
  nodes: Array<unknown>;
}): AxeRuleResult {
  return {
    id: rule.id,
    help: rule.help,
    description: rule.description,
    impact: rule.impact ?? null,
    nodeCount: rule.nodes.length
  };
}

function formatAxeError(url: string, error: unknown): string {
  if (error instanceof Error) {
    return `Accessibility analysis failed for ${url}. ${error.message}`;
  }

  return `Accessibility analysis failed for ${url}. ${formatErrorDetails(error, 'during-analyze')}`;
}

function formatErrorDetails(error: unknown, phase: 'before-analyze' | 'during-analyze' | 'transforming-results' | 'page-analysis'): string {
  if (!(error instanceof Error)) {
    return `phase=${phase}; message=Unknown non-Error value was thrown.`;
  }

  const stackExcerpt = error.stack
    ?.split('\n')
    .slice(0, 3)
    .map((line) => line.trim())
    .join(' | ');

  return `phase=${phase}; name=${error.name}; message=${error.message}${stackExcerpt ? `; stack=${stackExcerpt}` : ''}`;
}
