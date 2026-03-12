import { NextResponse } from 'next/server';

import { getScanSnapshot } from '@/lib/redis/scans';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const scan = await getScanSnapshot(id);

  if (!scan) {
    return NextResponse.json({ error: 'Scan not found.' }, { status: 404 });
  }

  return NextResponse.json(scan);
}
