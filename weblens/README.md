# Site Score

A minimal Next.js app that crawls a public site, checks simple SEO rules, runs axe-core accessibility analysis through Playwright, and shows the results on a dedicated results page.

## Stack

- Next.js App Router
- Tailwind CSS
- TypeScript
- Playwright
- axe-core

## Local setup

1. Install dependencies:
   - `npm install`
2. Install the Playwright browser binaries:
   - `npx playwright install chromium`
3. Start the dev server:
   - `npm run dev`
4. Visit `http://localhost:3000`

## Notes

- This version stores scan progress in memory. That is fine for local development, but not durable.
- Playwright runs on the server side only.
- The crawl is intentionally sequential for readability.
- The UI polls for progress once per second.

## Deployment caveat

The local-first architecture works best in a long-lived Node process. On Vercel, the in-memory scan store and long-running browser work are not a strong fit for production-grade reliability. A v2 deployment-friendly version would move scanning into a separate worker or queue-backed service.
