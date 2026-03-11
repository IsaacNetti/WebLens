import { NextRequest, NextResponse } from 'next/server';

import { runSiteScan } from '@/lib/scanner';
import { createScan } from '@/lib/scan-store';
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

  const scan = createScan(normalized.value, normalized.domain, maxPages);

  // Fire-and-forget works locally because the dev server is a long-lived Node
  // process. This is one of the reasons this architecture is local-first.
  void runSiteScan(scan.id);

  return NextResponse.json({ scanId: scan.id });
}
