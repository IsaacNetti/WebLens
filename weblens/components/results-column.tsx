import { ScoreSummary } from '@/lib/types';

import { CheckRow } from '@/components/check-row';

function scoreColor(state: ScoreSummary['state']) {
  if (state === 'good') {
    return 'text-green-600 dark:text-green-400';
  }

  if (state === 'medium') {
    return 'text-yellow-600 dark:text-yellow-400';
  }

  return 'text-red-600 dark:text-red-400';
}

export function ResultsColumn({ title, summary }: { title: string; summary?: ScoreSummary }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
        <div className="mt-4 flex items-end gap-3">
          <span className={`text-4xl font-semibold tracking-tight ${summary ? scoreColor(summary.state) : 'text-slate-400'}`}>
            {summary ? `${summary.score}` : '—'}
          </span>
          <span className="pb-1 text-sm text-slate-500 dark:text-slate-400">/ 100</span>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {summary ? summary.scoringNote : 'Results will appear here after the scan finishes.'}
        </p>
      </div>

      <div className="mt-5 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Passed checks</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{summary?.passed.length ?? 0}</span>
          </div>
          {summary?.passed.length ? (
            summary.passed.map((row) => <CheckRow key={row.id} row={row} />)
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No passed checks to display yet.</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Failed checks</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{summary?.failed.length ?? 0}</span>
          </div>
          {summary?.failed.length ? (
            summary.failed.map((row) => <CheckRow key={row.id} row={row} />)
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No failed checks detected.</p>
          )}
        </div>
      </div>
    </section>
  );
}
