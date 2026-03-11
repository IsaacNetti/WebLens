import { CheckRow, ScoreState, ScoreSummary, SeoDomSnapshot, SeoPageResult, SeoRuleId } from '@/lib/types';

const TITLE_MIN_LENGTH = 15;
const TITLE_MAX_LENGTH = 60;
const META_DESCRIPTION_MIN_LENGTH = 50;
const META_DESCRIPTION_MAX_LENGTH = 160;
const MIN_TEXT_CONTENT_LENGTH = 150;

const SEO_RULES: Array<{
  id: SeoRuleId;
  title: string;
  explanation: string;
  meaning: string;
  technical: string;
}> = [
  {
    id: 'title-present',
    title: 'Title exists',
    explanation: 'Every scanned page should have a non-empty <title> element.',
    meaning: 'Search engines and browser tabs rely on the page title to understand what the page is about.',
    technical: 'The scanner reads document.title through Playwright after the page loads.'
  },
  {
    id: 'title-length-reasonable',
    title: 'Title length is reasonable',
    explanation: 'Titles are usually most useful when they are long enough to describe the page but not so long that they become unwieldy.',
    meaning: 'A concise, descriptive title is easier for search engines and people to read in search results.',
    technical: `The scanner checks whether document.title is between ${TITLE_MIN_LENGTH} and ${TITLE_MAX_LENGTH} characters after trimming.`
  },
  {
    id: 'meta-description-present',
    title: 'Meta description exists',
    explanation: 'Every scanned page should have a meta description tag with content.',
    meaning: 'Descriptions are often used as search result snippets and help summarize the page.',
    technical: 'The scanner reads meta[name="description"] and checks for non-empty content.'
  },
  {
    id: 'meta-description-length-reasonable',
    title: 'Meta description length is reasonable',
    explanation: 'Descriptions are usually most useful when they are detailed enough to summarize the page without becoming excessively long.',
    meaning: 'A right-sized description is easier to reuse as a search snippet and avoids obviously thin metadata.',
    technical: `The scanner checks whether meta[name="description"] content is between ${META_DESCRIPTION_MIN_LENGTH} and ${META_DESCRIPTION_MAX_LENGTH} characters after trimming.`
  },
  {
    id: 'single-h1',
    title: 'Exactly one H1 present',
    explanation: 'Each scanned page should have one main heading.',
    meaning: 'A clear H1 helps communicate the primary topic and usually improves document structure.',
    technical: 'The scanner counts document.querySelectorAll("h1").length.'
  },
  {
    id: 'has-h2',
    title: 'Page has H2 tags',
    explanation: 'Most content pages benefit from having subheadings below the main heading.',
    meaning: 'H2 tags often indicate that the page has a clearer content hierarchy beyond the main heading.',
    technical: 'The scanner counts document.querySelectorAll("h2").length and checks for at least one H2.'
  },
  {
    id: 'meaningful-text-content',
    title: 'Page has meaningful text content',
    explanation: 'Pages should contain more than a tiny amount of visible text content.',
    meaning: 'Very thin pages are often harder for search engines and visitors to understand.',
    technical: `The scanner reads document.body.innerText, normalizes whitespace, and checks for at least ${MIN_TEXT_CONTENT_LENGTH} characters.`
  },
  {
    id: 'images-have-alt',
    title: 'Images have alt text',
    explanation: 'Images that appear in the page should include alt text.',
    meaning: 'Alt text helps both search engines and assistive technologies understand image content.',
    technical: 'The scanner counts img elements with missing or blank alt attributes.'
  },
  {
    id: 'html-lang-present',
    title: 'HTML lang attribute exists',
    explanation: 'The root html element should declare the document language.',
    meaning: 'This helps assistive technologies and some search systems interpret the page correctly.',
    technical: 'The scanner reads document.documentElement.lang.'
  },
  {
    id: 'canonical-present',
    title: 'Canonical exists',
    explanation: 'Pages should declare a canonical URL when practical.',
    meaning: 'Canonical URLs help reduce duplicate-content ambiguity.',
    technical: 'The scanner checks for link[rel="canonical"] with a non-empty href.'
  },
  {
    id: 'indexable',
    title: 'No obvious noindex directive',
    explanation: 'Pages should not include a robots noindex directive unless they are intentionally hidden from search.',
    meaning: 'A noindex directive can prevent search engines from indexing the page.',
    technical: 'The scanner looks for meta[name="robots"] content that includes "noindex".'
  },
  {
    id: 'internal-links-present',
    title: 'Page has internal links',
    explanation: 'Pages should link to at least one internal page when practical.',
    meaning: 'Internal linking helps crawlers and visitors move through the site.',
    technical: 'The scanner normalizes same-origin links found on the page and checks whether at least one internal link remains after filtering.'
  },
  {
    id: 'viewport-present',
    title: 'Viewport meta tag exists',
    explanation: 'Pages should declare a viewport meta tag.',
    meaning: 'This is a common technical signal for mobile-friendly page setup.',
    technical: 'The scanner reads meta[name="viewport"] and checks for non-empty content.'
  },
  {
    id: 'structured-data-present',
    title: 'Structured data is present',
    explanation: 'Pages often benefit from including structured data markup when relevant.',
    meaning: 'Structured data can help search engines understand page entities and content types more clearly.',
    technical: 'The scanner checks for JSON-LD script tags or common schema.org microdata attributes such as itemscope, itemtype, or itemprop.'
  },
  {
    id: 'open-graph-title-present',
    title: 'Open Graph title exists',
    explanation: 'Pages should usually declare og:title for sharing previews.',
    meaning: 'Open Graph metadata improves how pages appear when shared on social platforms and messaging apps.',
    technical: 'The scanner reads meta[property="og:title"] or meta[name="og:title"] and checks for non-empty content.'
  },
  {
    id: 'open-graph-description-present',
    title: 'Open Graph description exists',
    explanation: 'Pages should usually declare og:description for sharing previews.',
    meaning: 'Open Graph descriptions help shared links communicate page context more clearly.',
    technical: 'The scanner reads meta[property="og:description"] or meta[name="og:description"] and checks for non-empty content.'
  }
];

export function analyzeSeoForPage(url: string, title: string, dom: SeoDomSnapshot): SeoPageResult {
  const trimmedTitle = dom.title.trim();
  const trimmedDescription = dom.metaDescription.trim();

  return {
    url,
    title,
    checks: {
      'title-present': trimmedTitle.length > 0,
      'title-length-reasonable': trimmedTitle.length >= TITLE_MIN_LENGTH && trimmedTitle.length <= TITLE_MAX_LENGTH,
      'meta-description-present': trimmedDescription.length > 0,
      'meta-description-length-reasonable':
        trimmedDescription.length >= META_DESCRIPTION_MIN_LENGTH &&
        trimmedDescription.length <= META_DESCRIPTION_MAX_LENGTH,
      'single-h1': dom.h1Count === 1,
      'has-h2': dom.h2Count > 0,
      'meaningful-text-content': dom.textContentLength >= MIN_TEXT_CONTENT_LENGTH,
      'images-have-alt': dom.imagesMissingAlt === 0,
      'html-lang-present': dom.lang.trim().length > 0,
      'canonical-present': dom.canonical.trim().length > 0,
      indexable: !dom.hasNoindex,
      'internal-links-present': dom.internalLinkCount > 0,
      'viewport-present': dom.viewport.trim().length > 0,
      'structured-data-present': dom.hasStructuredData,
      'open-graph-title-present': dom.openGraphTitle.trim().length > 0,
      'open-graph-description-present': dom.openGraphDescription.trim().length > 0
    }
  };
}

export function aggregateSeo(pageResults: SeoPageResult[]): ScoreSummary {
  if (pageResults.length === 0) {
    return emptySummary('No pages were successfully analyzed, so no SEO score could be computed.');
  }

  const totalPages = pageResults.length;
  const totalPossibleChecks = totalPages * SEO_RULES.length;
  let totalPassedChecks = 0;

  const passedRows: CheckRow[] = [];
  const failedRows: CheckRow[] = [];

  for (const rule of SEO_RULES) {
    const failedUrls = pageResults
      .filter((page) => !page.checks[rule.id])
      .map((page) => page.url);

    const failedPages = failedUrls.length;
    const passedPages = totalPages - failedPages;
    totalPassedChecks += passedPages;

    const row: CheckRow = {
      id: rule.id,
      title: rule.title,
      status: failedPages === 0 ? 'pass' : 'fail',
      summary:
        failedPages === 0
          ? `Passed on all ${totalPages} scanned pages.`
          : `Passed on ${passedPages} of ${totalPages} scanned pages.`,
      explanation: rule.explanation,
      meaning: rule.meaning,
      technical: rule.technical,
      passedPages,
      failedPages,
      totalPages,
      exampleUrls: failedUrls.slice(0, 5)
    };

    if (row.status === 'pass') {
      passedRows.push(row);
    } else {
      failedRows.push(row);
    }
  }

  const score = Math.round((totalPassedChecks / totalPossibleChecks) * 100);

  return {
    score,
    state: scoreToState(score),
    passed: passedRows,
    failed: failedRows,
    scoringNote:
      'SEO score = successful page-level SEO checks divided by total attempted page-level SEO checks. Each rule has equal weight in this version.'
  };
}

export function getSeoRuleIdsThatFailed(pageResult: SeoPageResult): SeoRuleId[] {
  return SEO_RULES.filter((rule) => !pageResult.checks[rule.id]).map((rule) => rule.id);
}

function emptySummary(scoringNote: string): ScoreSummary {
  return {
    score: 0,
    state: 'poor',
    passed: [],
    failed: [],
    scoringNote
  };
}

function scoreToState(score: number): ScoreState {
  if (score >= 80) {
    return 'good';
  }

  if (score >= 50) {
    return 'medium';
  }

  return 'poor';
}
