import { StatusEvent } from '@/lib/types';

export function StatusTimeline({ logs }: { logs: StatusEvent[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Scan status</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            This list updates as the server moves through the crawl and analysis steps.
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-3">
        {logs.map((event) => (
          <li key={event.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{event.message}</p>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{event.stage}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
