import { UrlSearchForm } from '@/components/url-search-form';

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto flex min-h-[calc(100vh-57px)] max-w-5xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        <div className="w-full max-w-3xl space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              SEO and accessibility scanner
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-5xl">
              Score a public website
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
              Enter a full URL or a bare domain. The app will normalize the input, crawl internal pages on the same
              domain, and report rule-based SEO and automated accessibility findings.
            </p>
          </div>

          <UrlSearchForm />
        </div>

        <div className="mt-12 flex flex-col items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <p>Scroll down for more information</p>
          <span aria-hidden="true" className="text-base leading-none">
            ↓
          </span>
        </div>
      </section>

      <section className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">What the tool does</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>
                This app starts from one public page, crawls internal links on the same origin, and analyzes up to 20
                pages by default.
              </p>
              <p>
                It reports two separate result sets: a small, explainable SEO ruleset and an automated accessibility
                review powered by axe-core.
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">How the scan works</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>
                A server-side scanner uses Playwright to load real pages, gather page metadata, and discover internal
                links.
              </p>
              <p>
                The results page starts the scan and polls for progress, so the UI can show step-by-step status while
                the server continues the crawl.
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Why Playwright and axe-core</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>
                Playwright loads pages in a browser context instead of fetching raw HTML only. That makes it more useful
                for modern sites that render content with JavaScript.
              </p>
              <p>
                axe-core runs inside the page and returns structured accessibility findings that are widely used in web
                testing workflows.
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">What the checks mean</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              <p>
                The SEO checks look for straightforward structural signals like titles, descriptions, heading usage,
                canonical tags, image alt text, and language declarations.
              </p>
              <p>
                The accessibility checks highlight automated issues such as missing names, color contrast problems, and
                other DOM-level problems that tools can detect reliably.
              </p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}