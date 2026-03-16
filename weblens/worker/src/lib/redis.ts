import { randomUUID } from 'node:crypto';

import { Redis } from '@upstash/redis';

import { FinalScanResult, ScanStage, ScanStatus, StatusEvent } from './types';

const redis = Redis.fromEnv();
const SCAN_TTL_SECONDS = 60 * 60 * 24;
const MAX_SCAN_LOGS = 150;
const MAX_LOG_MESSAGE_LENGTH = 500;

interface StoredScanMeta {
  id: string;
  targetUrl: string;
  domain: string;
  status: ScanStatus;
  createdAt: string;
  updatedAt: string;
  maxPages: number;
}

interface StoredScanProgress {
  phase: ScanStage;
  pagesDiscovered: number;
  pagesScanned: number;
  maxPages: number;
  currentPage?: string;
}

function metaKey(scanId: string) {
  return `scan:${scanId}:meta`;
}

function progressKey(scanId: string) {
  return `scan:${scanId}:progress`;
}

function logsKey(scanId: string) {
  return `scan:${scanId}:logs`;
}

function resultKey(scanId: string) {
  return `scan:${scanId}:result`;
}

function errorKey(scanId: string) {
  return `scan:${scanId}:error`;
}

export async function getScanMeta(scanId: string): Promise<StoredScanMeta | null> {
  const raw = await redis.get(metaKey(scanId));
  return raw ? parseJson<StoredScanMeta>(raw) : null;
}

export async function setScanStatus(scanId: string, status: ScanStatus, phase: ScanStage, currentPage?: string): Promise<void> {
  const meta = await getScanMeta(scanId);

  if (!meta) {
    return;
  }

  await Promise.all([
    setJson(metaKey(scanId), {
      ...meta,
      status,
      updatedAt: new Date().toISOString()
    }),
    updateScanProgress(scanId, {
      phase,
      currentPage
    })
  ]);
}

export async function updateScanProgress(
  scanId: string,
  updates: Partial<StoredScanProgress>
): Promise<void> {
  const meta = await getScanMeta(scanId);

  if (!meta) {
    return;
  }

   const raw = await redis.get(progressKey(scanId));
  const current: StoredScanProgress = raw
    ? parseJson<StoredScanProgress>(raw)
    : {
        phase: 'queued',
        pagesDiscovered: 0,
        pagesScanned: 0,
        maxPages: meta.maxPages
      };

  await Promise.all([
    setJson(progressKey(scanId), {
      ...current,
      ...updates,
      maxPages: current.maxPages
    }),
    setJson(metaKey(scanId), {
      ...meta,
      updatedAt: new Date().toISOString()
    })
  ]);
}

export async function appendScanLog(scanId: string, stage: ScanStage, message: string): Promise<void> {
  const event: StatusEvent = {
    id: randomUUID(),
    stage,
    // Keep logs readable but bounded so very noisy scans do not grow memory or Redis usage without limit.
    message: truncateLogMessage(message),
    createdAt: new Date().toISOString()
  };

  await Promise.all([
    redis.rpush(logsKey(scanId), JSON.stringify(event)),
    // Keep only the most recent log entries, which is enough for the polling UI and troubleshooting.
    redis.ltrim(logsKey(scanId), -MAX_SCAN_LOGS, -1),
    redis.expire(logsKey(scanId), SCAN_TTL_SECONDS)
  ]);
}

export async function completeScan(scanId: string, result: FinalScanResult): Promise<void> {
  const meta = await getScanMeta(scanId);

  if (!meta) {
    return;
  }

  await Promise.all([
    setJson(metaKey(scanId), {
      ...meta,
      status: 'completed',
      updatedAt: new Date().toISOString()
    }),
    setJson(resultKey(scanId), result),
    redis.del(errorKey(scanId)),
    updateScanProgress(scanId, {
      phase: 'completed',
      pagesDiscovered: result.pagesDiscovered,
      pagesScanned: result.pagesScanned,
      currentPage: undefined
    })
  ]);

  await appendScanLog(scanId, 'completed', 'Scan finished.');
}

export async function failScan(scanId: string, error: string): Promise<void> {
  const meta = await getScanMeta(scanId);

  if (!meta) {
    return;
  }

  await Promise.all([
    setJson(metaKey(scanId), {
      ...meta,
      status: 'failed',
      updatedAt: new Date().toISOString()
    }),
    setJson(errorKey(scanId), { message: error }),
    updateScanProgress(scanId, {
      phase: 'failed',
      currentPage: undefined
    })
  ]);

  await appendScanLog(scanId, 'failed', error);
}

async function setJson(key: string, value: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(value), { ex: SCAN_TTL_SECONDS });
}

function truncateLogMessage(message: string): string {
  if (message.length <= MAX_LOG_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_LOG_MESSAGE_LENGTH - 1)}…`;
}
function parseJson<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }

  return value as T;
}