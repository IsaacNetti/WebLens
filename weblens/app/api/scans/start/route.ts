import { NextRequest, NextResponse } from 'next/server';

import { createQueuedScan, failScan, touchScan } from '@/lib/redis/scans';
import { dispatchScanToWorker } from '@/lib/worker/client';
import { normalizePublicUrl } from '@/lib/url';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const rawTarget = typeof body?.target === 'string' ? body.target : '';
  const rawMaxPages = typeof body?.maxPages === 'number' ? body.maxPages : 20;
  const maxPages = Math.max(1, Math.min(20, rawMaxPages));

  const normalized = normalizePublicUrl(rawTarget);

  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const scan = await createQueuedScan(normalized.value, normalized.domain, maxPages);

  try {
    await dispatchScanToWorker({
      scanId: scan.id,
      url: scan.targetUrl,
      maxPages: scan.maxPages
    });

    await touchScan(scan.id);

    return NextResponse.json({ scanId: scan.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to dispatch the scan worker.';
    await failScan(scan.id, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
