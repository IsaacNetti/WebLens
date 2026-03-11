import axe from 'axe-core';
import { chromium, type BrowserContext } from 'playwright';

import { aggregateAccessibility } from '@/lib/accessibility';
import { addScanLog, completeScan, failScan, getScan, setScanStatus, updateProgress } from '@/lib/scan-store';
import { aggregateSeo, analyzeSeoForPage, getSeoRuleIdsThatFailed } from '@/lib/seo';
import { AxeRuleResult, FinalScanResult, PageAnalysisResult, SeoDomSnapshot } from '@/lib/types';
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
      addScanLog(scanId, 'analyzing-page', `Analyzing ${nextUrl}`);

      // Each page is processed sequentially so the status log reads clearly
      // and the server work is easier to understand.
      const result = await analyzeSinglePage(context, nextUrl, origin);
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
        error: page.error
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
          'axe-core runs in the browser page and returns automated accessibility findings.',
          'Tailwind CSS handles the UI styling with a restrained default look.'
        ],
        scoringMethod: [
          seo.scoringNote,
          accessibility.scoringNote
        ],
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
  origin: string
): Promise<PageAnalysisResult> {
  const page = await context.newPage();

  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS
    });

    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

    // Collect the page data we need for SEO checks and future crawling.
    const dom = await page.evaluate(() => {
      const title = document.title ?? '';
      const metaDescription =
        document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.trim() ?? '';
      const h1Count = document.querySelectorAll('h1').length;
      const lang = document.documentElement.getAttribute('lang')?.trim() ?? '';
      const canonical =
        document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href?.trim() ?? '';
      const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content?.toLowerCase() ?? '';
      const images = [...document.querySelectorAll('img')];
      const imagesMissingAlt = images.filter((image) => !image.hasAttribute('alt') || !image.getAttribute('alt')?.trim()).length;
      const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
        .map((anchor) => anchor.href)
        .filter(Boolean);

      return {
        title,
        metaDescription,
        h1Count,
        lang,
        canonical,
        hasNoindex: robots.includes('noindex'),
        imageCount: images.length,
        imagesMissingAlt,
        links
      } satisfies SeoDomSnapshot & { links: string[] };
    });

    const currentUrl = page.url();
    const normalizedCurrent = normalizeCrawlUrl(currentUrl) ?? currentUrl;
    const discoveredLinks = dom.links
      .map((link) => normalizeCrawlUrl(link))
      .filter((link): link is string => Boolean(link))
      .filter((link) => shouldVisitLink(link, origin))
      .filter((link) => link !== normalizedCurrent);

    // Inject axe-core into the loaded page, then ask it to evaluate the DOM.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await page.addScriptTag({ content: axe.source });

    const axeResults = await page.evaluate(async () => {
      const raw = await (window as typeof window & { axe: typeof axe }).axe.run(document, {
        resultTypes: ['violations', 'passes']
      });

      return {
        violations: raw.violations,
        passes: raw.passes
      };
    });

    const seoResult = analyzeSeoForPage(normalizedCurrent, dom.title || normalizedCurrent, dom);

    return {
      url: normalizedCurrent,
      title: dom.title || normalizedCurrent,
      discoveredLinks,
      seo: seoResult,
      accessibility: {
        violations: axeResults.violations.map(minifyAxeRule),
        passes: axeResults.passes.map(minifyAxeRule)
      }
    };
  } catch (error) {
    const safeUrl = normalizeCrawlUrl(targetUrl) ?? targetUrl;
    const message = error instanceof Error ? error.message : 'Page analysis failed.';

    return {
      url: safeUrl,
      title: safeUrl,
      discoveredLinks: [],
      // If a page fails to load, we return an error result instead of crashing
      // the whole site scan.
      seo: analyzeSeoForPage(safeUrl, safeUrl, {
        title: '',
        metaDescription: '',
        h1Count: 0,
        lang: '',
        canonical: '',
        hasNoindex: false,
        imageCount: 0,
        imagesMissingAlt: 0
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
