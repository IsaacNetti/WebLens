import { AxeRuleResult, CheckRow, PageAnalysisResult, ScoreState, ScoreSummary } from '@/lib/types';

const IMPACT_RANK: Record<string, number> = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1
};

export function aggregateAccessibility(pageResults: PageAnalysisResult[]): ScoreSummary {
  if (pageResults.length === 0) {
    return {
      score: 0,
      state: 'poor',
      passed: [],
      failed: [],
      scoringNote: 'No pages were successfully analyzed, so no accessibility score could be computed.'
    };
  }

  const pagesWithResults = pageResults.filter((page) => !page.error);
  const pagesWithAxeResults = pagesWithResults.filter(
    (page) => page.accessibility.violations.length > 0 || page.accessibility.passes.length > 0
  );
  const totalPages = pagesWithResults.length;

  if (pagesWithResults.length === 0) {
    return {
      score: 0,
      state: 'poor',
      passed: [],
      failed: [],
      scoringNote: 'All page analyses failed before axe-core could produce results.'
    };
  }

  if (pagesWithAxeResults.length === 0) {
    return {
      score: 0,
      state: 'poor',
      passed: [],
      failed: [],
      scoringNote: 'Pages were analyzed successfully, but axe-core did not return accessibility results for any page.'
    };
  }

  const violationMap = new Map<string, { rule: AxeRuleResult; pages: Set<string> }>();
  const passMap = new Map<string, { rule: AxeRuleResult; pages: Set<string> }>();

  let totalViolations = 0;
  let totalPasses = 0;

  for (const page of pagesWithAxeResults) {
    totalViolations += page.accessibility.violations.length;
    totalPasses += page.accessibility.passes.length;

    for (const violation of page.accessibility.violations) {
      const existing = violationMap.get(violation.id) ?? {
        rule: { ...violation, nodeCount: 0 },
        pages: new Set<string>()
      };

      existing.pages.add(page.url);

      if (rankImpact(violation.impact) > rankImpact(existing.rule.impact)) {
        existing.rule.impact = violation.impact;
      }

      existing.rule.nodeCount += violation.nodeCount;
      violationMap.set(violation.id, existing);
    }

    for (const pass of page.accessibility.passes) {
      const existing = passMap.get(pass.id) ?? {
        rule: { ...pass, nodeCount: 0 },
        pages: new Set<string>()
      };

      existing.pages.add(page.url);
      existing.rule.nodeCount += pass.nodeCount;
      passMap.set(pass.id, existing);
    }
  }

  const failed: CheckRow[] = [...violationMap.values()]
    .map(({ rule, pages }) => ({
      id: rule.id,
      title: rule.help,
      status: 'fail' as const,
      summary: `Failed on ${pages.size} of ${totalPages} scanned pages.`,
      explanation: rule.description,
      meaning: 'This means axe-core found an automated accessibility issue that should be reviewed and likely fixed.',
      technical: `Axe rule id: ${rule.id}. Highest recorded impact: ${rule.impact ?? 'unknown'}. Approximate affected nodes: ${rule.nodeCount}.`,
      passedPages: Math.max(totalPages - pages.size, 0),
      failedPages: pages.size,
      totalPages,
      exampleUrls: [...pages].slice(0, 5)
    }))
    .sort(
      (a, b) =>
        rankImpact(extractImpact(b.technical)) - rankImpact(extractImpact(a.technical)) ||
        a.title.localeCompare(b.title)
    );

  const passed: CheckRow[] = [...passMap.values()]
    .filter(({ rule }) => !violationMap.has(rule.id))
    .map(({ rule, pages }) => ({
      id: rule.id,
      title: rule.help,
      status: 'pass' as const,
      summary: `Observed as passing on ${pages.size} of ${totalPages} scanned pages where axe reported that rule.`,
      explanation: rule.description,
      meaning: 'This means axe-core did not flag that specific automated rule where it applied.',
      technical: `Axe rule id: ${rule.id}. Approximate passed-node observations: ${rule.nodeCount}.`,
      passedPages: pages.size,
      failedPages: 0,
      totalPages,
      exampleUrls: []
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const denominator = totalPasses + totalViolations;
  const score = denominator === 0 ? 100 : Math.round((totalPasses / denominator) * 100);

  return {
    score,
    state: scoreToState(score),
    passed,
    failed,
    scoringNote:
      'Accessibility score = total axe pass results divided by total axe pass and violation results returned across scanned pages. Incomplete and inapplicable axe results are not counted in this version.'
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

function rankImpact(impact: string | null | undefined): number {
  if (!impact) {
    return 0;
  }

  return IMPACT_RANK[impact] ?? 0;
}

function extractImpact(technical: string): string | undefined {
  const match = technical.match(/Highest recorded impact: ([a-z]+)/i);
  return match?.[1]?.toLowerCase();
}