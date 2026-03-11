'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { normalizePublicUrl } from '@/lib/url';

export function UrlSearchForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  const validation = useMemo(() => {
    if (!value.trim()) {
      return null;
    }

    return normalizePublicUrl(value);
  }, [value]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);

    // The same normalization function is used on both client and server so the
    // user sees the same validation rules that the API will enforce.
    const normalized = normalizePublicUrl(value);

    if (!normalized.ok) {
      return;
    }

    router.push(`/results?target=${encodeURIComponent(normalized.value)}`);
  }

  const errorMessage = touched && validation && !validation.ok ? validation.error : null;
  const normalizedHint = validation && validation.ok ? validation.value : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-2xl border border-slate-300 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="target-url" className="sr-only">
            Website URL
          </label>
          <input
            id="target-url"
            name="target-url"
            type="text"
            placeholder="example.com"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            className="h-12 flex-1 rounded-xl border border-transparent bg-white px-4 text-base text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus:border-blue-500 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950"
          >
            Score
          </button>
        </div>
      </div>

      <div className="min-h-6 text-left text-sm">
        {errorMessage ? (
          <p className="text-red-600 dark:text-red-400">{errorMessage}</p>
        ) : normalizedHint ? (
          <p className="text-slate-500 dark:text-slate-400">Normalized target: {normalizedHint}</p>
        ) : (
          <p className="text-slate-400 dark:text-slate-500">Accepts full URLs and bare domains.</p>
        )}
      </div>
    </form>
  );
}
