export type ValidationResult =
  | {
      ok: true;
      value: string;
      domain: string;
    }
  | {
      ok: false;
      error: string;
    };

export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ScanStage =
  | 'queued'
  | 'starting'
  | 'launching-browser'
  | 'discovering-pages'
  | 'analyzing-page'
  | 'aggregating-results'
  | 'completed'
  | 'failed';

export type CheckStatus = 'pass' | 'fail';

export type ScoreState = 'good' | 'medium' | 'poor';

export type SeoRuleId =
  | 'title-present'
  | 'meta-description-present'
  | 'single-h1'
  | 'images-have-alt'
  | 'html-lang-present'
  | 'canonical-present'
  | 'indexable';

export interface StatusEvent {
  id: string;
  stage: ScanStage;
  message: string;
  createdAt: string;
}

export interface CheckRow {
  id: string;
  title: string;
  status: CheckStatus;
  summary: string;
  explanation: string;
  meaning: string;
  technical: string;
  passedPages: number;
  failedPages: number;
  totalPages: number;
  exampleUrls: string[];
}

export interface ScoreSummary {
  score: number;
  state: ScoreState;
  passed: CheckRow[];
  failed: CheckRow[];
  scoringNote: string;
}

export interface PageTechnicalSummary {
  url: string;
  title: string;
  seoFailedRuleIds: string[];
  axeViolationCount: number;
  axePassCount: number;
  discoveredLinks: number;
  error?: string;
}

export interface FinalScanResult {
  domain: string;
  targetUrl: string;
  pagesDiscovered: number;
  pagesScanned: number;
  seo: ScoreSummary;
  accessibility: ScoreSummary;
  pages: PageTechnicalSummary[];
  technical: {
    crawlRules: string[];
    libraries: string[];
    scoringMethod: string[];
    limitations: string[];
  };
}

export interface ScanSnapshot {
  id: string;
  targetUrl: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
  status: ScanStatus;
  stage: ScanStage;
  maxPages: number;
  pagesDiscovered: number;
  pagesScanned: number;
  currentPage?: string;
  logs: StatusEvent[];
  result?: FinalScanResult;
  error?: string;
}

export interface SeoDomSnapshot {
  title: string;
  metaDescription: string;
  h1Count: number;
  lang: string;
  canonical: string;
  hasNoindex: boolean;
  imageCount: number;
  imagesMissingAlt: number;
}

export interface SeoPageResult {
  url: string;
  title: string;
  checks: Record<SeoRuleId, boolean>;
}

export interface AxeRuleResult {
  id: string;
  help: string;
  description: string;
  impact: string | null;
  nodeCount: number;
}

export interface PageAnalysisResult {
  url: string;
  title: string;
  discoveredLinks: string[];
  seo: SeoPageResult;
  accessibility: {
    violations: AxeRuleResult[];
    passes: AxeRuleResult[];
  };
  error?: string;
}
