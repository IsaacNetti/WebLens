import { IncomingMessage, ServerResponse } from 'node:http';

import { runSiteScan } from '../lib/scanner';
import { getScanMeta } from '../lib/redis';
import { WorkerRunRequest } from '../lib/types';

export async function handleScanRoutes(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method === 'POST' && req.url === '/scans/run') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized.' });
      return true;
    }

    const body = await readJsonBody<WorkerRunRequest>(req).catch(() => null);
    const scanId = typeof body?.scanId === 'string' ? body.scanId : '';
    const url = typeof body?.url === 'string' ? body.url : '';
    const maxPages = typeof body?.maxPages === 'number' ? body.maxPages : 20;

    if (!scanId || !url) {
      sendJson(res, 400, { error: 'scanId and url are required.' });
      return true;
    }

    const existing = await getScanMeta(scanId);
    if (!existing) {
      sendJson(res, 404, { error: 'Scan not found in Redis.' });
      return true;
    }

    void runSiteScan(scanId, url, Math.max(1, Math.min(20, maxPages)));
    sendJson(res, 202, { accepted: true });
    return true;
  }

  return false;
}

function isAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.WORKER_SHARED_SECRET;

  if (!expected) {
    return true;
  }

  return req.headers.authorization === `Bearer ${expected}`;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(body) as T;
}
