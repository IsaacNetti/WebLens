import type { Metadata } from 'next';
import Link from 'next/link';

import './globals.css';

export const metadata: Metadata = {
  title: 'WebLens',
  description: 'A minimal SEO and accessibility scanner for public websites.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-100">
          <header className="border-b border-slate-200 dark:border-slate-800">
            <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
              <Link href="/" className="text-sm font-semibold text-slate-900 no-underline dark:text-slate-100">
                WebLens
              </Link>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
