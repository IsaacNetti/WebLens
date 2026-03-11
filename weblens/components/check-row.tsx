import { CheckRow as CheckRowType } from '@/lib/types';

function badgeClass(status: 'pass' | 'fail') {
  if (status === 'pass') {
    return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300';
  }

  return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300';
}

export function CheckRow({ row }: { row: CheckRowType }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="cursor-pointer p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${badgeClass(
                  row.status
                )}`}
              >
                {row.status}
              </span>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{row.title}</h4>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{row.summary}</p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {row.passedPages}/{row.totalPages} pages passed
          </div>
        </div>
      </summary>

      <div className="border-t border-slate-200 px-4 py-4 text-sm dark:border-slate-800">
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-50">What was checked</p>
            <p className="mt-1">{row.explanation}</p>
          </div>
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-50">Why it matters</p>
            <p className="mt-1">{row.meaning}</p>
          </div>
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-50">Technical detail</p>
            <p className="mt-1">{row.technical}</p>
          </div>
          {row.exampleUrls.length > 0 ? (
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-50">Example affected pages</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {row.exampleUrls.map((url) => (
                  <li key={url} className="break-all">
                    {url}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}
