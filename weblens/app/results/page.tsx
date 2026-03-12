import Link from 'next/link';

import { ResultsClient } from '@/components/results-client';
import { normalizePublicUrl } from '@/lib/url';

type ResultsPageProps = {
  searchParams: Promise<{
    target?: string;
  }>;
};

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const params = await searchParams;
  const target = params.target ?? '';
  const normalized = normalizePublicUrl(target);

  if (!normalized.ok) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="border-b border-slate-200 dark:border-slate-800">
            <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
              <Link href="/" className="text-sm font-semibold text-slate-900 no-underline dark:text-slate-100">
                WebLens
              </Link>
            </div>
          </div>
        
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-950 dark:bg-red-950/30">
          <h1 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Invalid scan target</h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{normalized.error}</p>
          <p className="mt-4 text-sm">
            <Link href="/">Return to the home page</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="border-b border-slate-200 dark:border-slate-800">
            <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
              <Link href="/" className="text-sm font-semibold text-slate-900 no-underline dark:text-slate-100">
                WebLens
              </Link>
            </div>
          </div>
      <ResultsClient targetUrl={normalized.value} domain={normalized.domain} />
    </main>
  );
}
