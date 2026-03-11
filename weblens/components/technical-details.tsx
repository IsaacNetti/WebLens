import { FinalScanResult, ScanSnapshot } from '@/lib/types';

export function TechnicalDetails({ scan, result }: { scan: ScanSnapshot; result: FinalScanResult }) {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <summary className="cursor-pointer">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Technical details</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Expand this section to inspect crawl rules, scoring logic, limitations, and per-page output.
          </p>
        </div>
      </summary>

      <div className="mt-5 space-y-6 border-t border-slate-200 pt-5 text-sm dark:border-slate-800">
        <section>
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">Current scan state</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Status" value={scan.status} />
            <Stat label="Stage" value={scan.stage} />
            <Stat label="Pages discovered" value={String(scan.pagesDiscovered)} />
            <Stat label="Pages scanned" value={String(scan.pagesScanned)} />
          </dl>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ListBlock title="Crawl logic" items={result.technical.crawlRules} />
          <ListBlock title="Libraries in use" items={result.technical.libraries} />
          <ListBlock title="Scoring" items={result.technical.scoringMethod} />
          <ListBlock title="Limitations" items={result.technical.limitations} />
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">Per-page summary</h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-left dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Page</th>
                  <th className="px-4 py-3 font-medium">SEO failures</th>
                  <th className="px-4 py-3 font-medium">Axe violations</th>
                  <th className="px-4 py-3 font-medium">Axe passes</th>
                  <th className="px-4 py-3 font-medium">Internal links found</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {result.pages.map((page) => (
                  <tr key={page.url}>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-900 dark:text-slate-50">{page.title}</div>
                      <div className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{page.url}</div>
                      {page.error ? (
                        <div className="mt-2 text-xs text-red-600 dark:text-red-400">Error: {page.error}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">{page.seoFailedRuleIds.length}</td>
                    <td className="px-4 py-3 align-top">{page.axeViolationCount}</td>
                    <td className="px-4 py-3 align-top">{page.axePassCount}</td>
                    <td className="px-4 py-3 align-top">{page.discoveredLinks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-50">{value}</dd>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700 dark:text-slate-300">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
