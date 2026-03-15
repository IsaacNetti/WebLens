import AxeBuilder from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';
import { chromium, type BrowserContext, type Page } from 'playwright';

import { aggregateAccessibility } from './accessibility';
import { failWorkerScan, finishScan, logStage, setProgress, setStage } from './logger';
import { aggregateSeo, analyzeSeoForPage, getSeoRuleIdsThatFailed } from './seo';
import { AxeRuleResult, FinalScanResult, PageAnalysisResult, SeoDomSnapshot } from './types';
import { normalizeCrawlUrl, shouldVisitLink } from './url';

const PAGE_TIMEOUT_MS = 20_000;
const DOM_STABILIZE_MS = 250;

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

export async function runSiteScan(scanId: string, targetUrl: string, maxPages: number): Promise<void> {
  await setStage(scanId, 'running', 'starting');
  await logStage(scanId, 'starting', `Starting scan for ${targetUrl}`);
  await logStage(scanId, 'launching-browser', 'Launching Chromium through Playwright.');

  const browser = await chromium.launch({
    headless: true,
    // These flags keep Chromium lighter on small worker instances.
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--disable-background-networking']
  });
  const context = await browser.newContext();

  // We only need the HTML, metadata, and computed accessibility tree. Blocking
  // heavy binary assets like images, media, and fonts reduces transfer and
  // memory use without removing the DOM elements that already exist in markup.
  await context.route('**/*', async (route) => {
    const type = route.request().resourceType();

    if (BLOCKED_RESOURCE_TYPES.has(type)) {
      await route.abort();
      return;
    }

    await route.continue();
  });

  try {
    const origin = new URL(targetUrl).origin;
    const queue: string[] = [targetUrl];
    const discovered = new Set<string>([targetUrl]);
    const analyzedPages: PageAnalysisResult[] = [];

    await setProgress(scanId, {
      phase: 'discovering-pages',
      pagesDiscovered: discovered.size,
      pagesScanned: 0
    });

    await logStage(
      scanId,
      'discovering-pages',
      `Seeded the crawl queue with the starting page. Up to ${maxPages} internal pages will be analyzed.`
    );

    while (queue.length > 0 && analyzedPages.length < maxPages) {
      const nextUrl = queue.shift();

      if (!nextUrl) {
        break;
      }

      await setStage(scanId, 'running', 'analyzing-page', nextUrl);
      await logStage(scanId, 'analyzing-page', `Page analysis started for ${nextUrl}`);

      const result = await analyzeSinglePage(context, nextUrl, origin, scanId);
      analyzedPages.push(result);

      for (const discoveredLink of result.discoveredLinks) {
        if (discovered.has(discoveredLink)) {
          continue;
        }

        discovered.add(discoveredLink);
        queue.push(discoveredLink);
      }

      await setProgress(scanId, {
        phase: 'discovering-pages',
        pagesDiscovered: discovered.size,
        pagesScanned: analyzedPages.length,
        currentPage: nextUrl
      });

      await logStage(
        scanId,
        'discovering-pages',
        `Queue now has ${queue.length} pending pages. ${analyzedPages.length} page(s) analyzed so far.`
      );
    }

    await logStage(scanId, 'aggregating-results', 'Aggregating site-wide SEO and accessibility results.');
    await setStage(scanId, 'running', 'aggregating-results');

    const successfulPages = analyzedPages.filter((page) => !page.error);
    const seo = aggregateSeo(successfulPages.map((page) => page.seo));
    const accessibility = aggregateAccessibility(successfulPages);
    const domain = new URL(targetUrl).hostname;

    const finalResult: FinalScanResult = {
      domain,
      targetUrl,
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
          `The scan stops after ${maxPages} analyzed pages.`
        ],
        libraries: [
          'Next.js route handlers are used for start and polling endpoints.',
          'Playwright loads pages in a real browser context and executes page scripts.',
          '@axe-core/playwright runs axe-core in the page using the official Playwright integration.',
          'Upstash Redis stores scan metadata, progress, logs, and final results for 24 hours.'
        ],
        scoringMethod: [seo.scoringNote, accessibility.scoringNote],
        limitations: [
          'This version scans sequentially, which is slower than a concurrent worker design but easier to read and reason about.',
          'Only public same-origin pages discovered from crawled links are included.',
          'The validator blocks obvious local/private hostnames but does not fully solve SSRF or DNS-based private-network edge cases.',
          'axe-core covers automated accessibility checks only. Manual review is still needed.',
          'Redis state expires after 24 hours and is not intended as permanent history.'
        ]
      }
    };

    await logStage(
      scanId,
      'aggregating-results',
      `Final result summary: ${finalResult.pagesScanned} pages scanned, SEO score ${finalResult.seo.score}, Accessibility score ${finalResult.accessibility.score}.`
    );

    await finishScan(scanId, finalResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected scanner failure.';
    await failWorkerScan(scanId, message);
  } finally {
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

    // domcontentloaded is enough for our DOM-first checks. A short settle time
    // helps hydration-driven metadata appear without waiting on long-running
    // network activity from analytics, images, or ads.
    await page.waitForTimeout(DOM_STABILIZE_MS);

    const pageState = await page.evaluate(() => document.readyState).catch(() => 'unavailable');
    await logStage(
      scanId,
      'analyzing-page',
      `Page loaded successfully for ${targetUrl}. Final URL: ${page.url()}. readyState: ${pageState}. Frames detected: ${page.frames().length}.`
    );

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
      const images = [...document.querySelectorAll('img')];
      const imagesMissingAlt = images.filter((image) => !image.hasAttribute('alt') || !image.getAttribute('alt')?.trim()).length;
      const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content?.trim() ?? '';
      const hasStructuredData =
        document.querySelector('script[type="application/ld+json"]') !== null ||
        document.querySelector('[itemscope], [itemtype], [itemprop]') !== null;
      const openGraphTitle =
        document.querySelector<HTMLMetaElement>('meta[property="og:title"], meta[name="og:title"]')?.content?.trim() ?? '';
      const openGraphDescription =
        document.querySelector<HTMLMetaElement>('meta[property="og:description"], meta[name="og:description"]')?.content?.trim() ?? '';
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

    await logStage(
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

    const seoResult = analyzeSeoForPage(normalizedCurrent, dom.title || normalizedCurrent, {
      ...dom,
      internalLinkCount: discoveredLinks.length
    });

    await logStage(
      scanId,
      'analyzing-page',
      `SEO analysis completed for ${normalizedCurrent}. Internal crawl links kept: ${discoveredLinks.length}.`
    );

    let accessibility: PageAnalysisResult['accessibility'] = {
      violations: [],
      passes: []
    };
    let accessibilityError: string | undefined;

    await logStage(
      scanId,
      'analyzing-page',
      `Accessibility analysis starting for ${normalizedCurrent}. Page closed: ${page.isClosed()}. Main frame URL: ${page.mainFrame().url()}. Frames: ${page.frames().length}.`
    );

    try {
      const axeRun = await runAxeOnPage(page);
      // Convert the raw axe payload into the compact shape used by the UI as
      // early as possible so we do not retain the full result object longer than needed.
      accessibility = {
        violations: axeRun.results.violations.map(minifyAxeRule),
        passes: axeRun.results.passes.map(minifyAxeRule)
      };

      await logStage(
        scanId,
        'analyzing-page',
        `Accessibility analysis completed for ${normalizedCurrent}. violations=${axeRun.results.violations.length}, passes=${axeRun.results.passes.length}, incomplete=${axeRun.results.incomplete.length}, inapplicable=${axeRun.results.inapplicable.length}, durationMs=${axeRun.durationMs}.`
      );
    } catch (error) {
      accessibilityError = formatAxeError(normalizedCurrent, error);
      await logStage(scanId, 'analyzing-page', accessibilityError);
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

    await logStage(
      scanId,
      'analyzing-page',
      `Page analysis failed for ${safeUrl}. ${formatErrorDetails(error, 'page-analysis')}`
    );

    return {
      url: safeUrl,
      title: safeUrl,
      discoveredLinks: [],
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

  const builder = new AxeBuilder({ page }).options({
    resultTypes: ['violations', 'passes', 'incomplete', 'inapplicable']
  });

  const results = await builder.analyze();

  return {
    results: {
      violations: results.violations ?? [],
      passes: results.passes ?? [],
      incomplete: results.incomplete ?? [],
      inapplicable: results.inapplicable ?? []
    },
    durationMs: Date.now() - startedAt
  };
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
  return `Accessibility analysis failed for ${url}. ${formatErrorDetails(error, 'during-analyze')}`;
}

function formatErrorDetails(error: unknown, phase: 'during-analyze' | 'page-analysis'): string {
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