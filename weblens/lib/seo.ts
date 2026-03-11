import { CheckRow, ScoreState, ScoreSummary, SeoDomSnapshot, SeoPageResult, SeoRuleId } from '@/lib/types';

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
    id: 'meta-description-present',
    title: 'Meta description exists',
    explanation: 'Every scanned page should have a meta description tag with content.',
    meaning: 'Descriptions are often used as search result snippets and help summarize the page.',
    technical: 'The scanner reads meta[name="description"] and checks for non-empty content.'
  },
  {
    id: 'single-h1',
    title: 'Exactly one H1 present',
    explanation: 'Each scanned page should have one main heading.',
    meaning: 'A clear H1 helps communicate the primary topic and usually improves document structure.',
    technical: 'The scanner counts document.querySelectorAll("h1").length.'
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
  }
];

export function analyzeSeoForPage(url: string, title: string, dom: SeoDomSnapshot): SeoPageResult {
  return {
    url,
    title,
    checks: {
      'title-present': dom.title.trim().length > 0,
      'meta-description-present': dom.metaDescription.trim().length > 0,
      'single-h1': dom.h1Count === 1,
      'images-have-alt': dom.imagesMissingAlt === 0,
      'html-lang-present': dom.lang.trim().length > 0,
      'canonical-present': dom.canonical.trim().length > 0,
      indexable: !dom.hasNoindex
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
