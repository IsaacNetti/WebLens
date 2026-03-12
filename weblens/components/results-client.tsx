'use client';

import { useEffect, useMemo, useState } from 'react';

import { ResultsColumn } from '@/components/results-column';
import { StatusTimeline } from '@/components/status-timeline';
import { TechnicalDetails } from '@/components/technical-details';
import { ScanSnapshot } from '@/lib/types';

type ResultsClientProps = {
  targetUrl: string;
  domain: string;
};

export function ResultsClient({ targetUrl, domain }: ResultsClientProps) {
  const [scanId, setScanId] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanSnapshot | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function startScan() {
      // The results page is responsible for initiating the scan.
      // The home page only validates and routes the user here.
      try {
        setStartError(null);

        const response = await fetch('/api/scans/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            target: targetUrl,
            maxPages: 20
          })
        });

        const payload = (await response.json().catch(() => null)) as { scanId?: string; error?: string } | null;

        if (!response.ok || !payload?.scanId) {
          throw new Error(payload?.error ?? 'Unable to start the scan.');
        }

        if (!cancelled) {
          setScanId(payload.scanId);
        }
      } catch (error) {
        if (!cancelled) {
          setStartError(error instanceof Error ? error.message : 'Unable to start the scan.');
        }
      }
    }

    void startScan();

    return () => {
      cancelled = true;
    };
  }, [targetUrl]);

  useEffect(() => {
    if (!scanId) {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    async function loadSnapshot() {
      // Polling keeps the implementation simple for v1.
      // The server returns the latest in-memory snapshot for this scan.
      try {
        const response = await fetch(`/api/scans/${scanId}`, {
          cache: 'no-store'
        });

        const payload = (await response.json()) as ScanSnapshot | { error?: string };

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error ?? 'Unable to fetch scan status.' : 'Unable to fetch scan status.');
        }

        if (!cancelled) {
          const nextScan = payload as ScanSnapshot;
          setScan(nextScan);

          if ((nextScan.status === 'completed' || nextScan.status === 'failed') && intervalId !== null) {
            window.clearInterval(intervalId);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setStartError(error instanceof Error ? error.message : 'Unable to fetch scan status.');
        }
      }
    }

    void loadSnapshot();
    intervalId = window.setInterval(loadSnapshot, 1000);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [scanId]);

  const currentStatus = useMemo(() => {
    if (!scan) {
      return 'Preparing scan...';
    }

    if (scan.status === 'failed') {
      return scan.error ?? 'Scan failed.';
    }

    if (scan.status === 'completed') {
      return 'Scan complete.';
    }

    return scan.logs[scan.logs.length - 1]?.message ?? 'Working...';
  }, [scan]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Scan target
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{domain}</h1>
            <p className="break-all text-sm text-slate-600 dark:text-slate-300">{targetUrl}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
            <SummaryStat label="Status" value={startError ? 'failed' : scan?.status ?? 'starting'} />
            <SummaryStat label="Pages discovered" value={String(scan?.pagesDiscovered ?? 0)} />
            <SummaryStat label="Pages scanned" value={String(scan?.pagesScanned ?? 0)} />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-800 dark:border-blue-950 dark:bg-blue-950/30 dark:text-slate-100">
          <p className="font-medium">Current status</p>
          <p className="mt-1">{startError ?? currentStatus}</p>
          {scan?.currentPage ? <p className="mt-2 break-all text-xs text-slate-600 dark:text-slate-300">Page: {scan.currentPage}</p> : null}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ResultsColumn title="SEO" summary={scan?.result?.seo} />
        <ResultsColumn title="Accessibility" summary={scan?.result?.accessibility} />
      </section>

      <StatusTimeline logs={scan?.logs ?? [{ id: 'starting', createdAt: 'pending', stage: 'starting', message: 'Waiting for the server to start the scan.' }]} />

      {scan?.result ? <TechnicalDetails scan={scan} result={scan.result} /> : null}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-50">{value}</div>
    </div>
  );
}
