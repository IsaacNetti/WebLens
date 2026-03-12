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
          {children}
        </div>
      </body>
    </html>
  );
}
