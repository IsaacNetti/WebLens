import { randomUUID } from 'node:crypto';

import { redis, SCAN_TTL_SECONDS } from '@/lib/redis/client';
import { FinalScanResult, ScanSnapshot, ScanStage, ScanStatus, StatusEvent } from '@/lib/types';

export interface StoredScanMeta {
  id: string;
  targetUrl: string;
  domain: string;
  status: ScanStatus;
  createdAt: string;
  updatedAt: string;
  maxPages: number;
}

export interface StoredScanProgress {
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

export const scanRedisKeys = {
  metaKey,
  progressKey,
  logsKey,
  resultKey,
  errorKey
};

export async function createQueuedScan(targetUrl: string, domain: string, maxPages: number): Promise<StoredScanMeta> {
  const now = new Date().toISOString();
  const id = randomUUID();

  const meta: StoredScanMeta = {
    id,
    targetUrl,
    domain,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    maxPages
  };

  const progress: StoredScanProgress = {
    phase: 'queued',
    pagesDiscovered: 0,
    pagesScanned: 0,
    maxPages
  };

  await Promise.all([
    setJson(metaKey(id), meta),
    setJson(progressKey(id), progress),
    redis.del(logsKey(id), resultKey(id), errorKey(id))
  ]);

  await appendScanLog(id, 'queued', 'Scan queued.');

  return meta;
}

export async function getScanSnapshot(scanId: string): Promise<ScanSnapshot | null> {
  const [metaRaw, progressRaw, logItems, resultRaw, errorRaw] = await Promise.all([
    redis.get<string>(metaKey(scanId)),
    redis.get<string>(progressKey(scanId)),
    redis.lrange<string[]>(logsKey(scanId), 0, -1),
    redis.get<string>(resultKey(scanId)),
    redis.get<string>(errorKey(scanId))
  ]);

  if (!metaRaw) {
    return null;
  }

  const meta = parseJson<StoredScanMeta>(metaRaw);
  const progress = progressRaw ? parseJson<StoredScanProgress>(progressRaw) : null;
  const logs = (logItems ?? []).map((entry) => parseJson<StatusEvent>(entry));
  const result = resultRaw ? parseJson<FinalScanResult>(resultRaw) : undefined;
  const error = errorRaw ? parseJson<{ message: string }>(errorRaw).message : undefined;

  return {
    id: meta.id,
    targetUrl: meta.targetUrl,
    domain: meta.domain,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: meta.status,
    stage: progress?.phase ?? 'queued',
    maxPages: meta.maxPages,
    pagesDiscovered: progress?.pagesDiscovered ?? 0,
    pagesScanned: progress?.pagesScanned ?? 0,
    currentPage: progress?.currentPage,
    logs,
    result,
    error
  };
}

export async function touchScan(scanId: string): Promise<void> {
  const meta = await getScanMeta(scanId);

  if (!meta) {
    return;
  }

  await setJson(metaKey(scanId), {
    ...meta,
    updatedAt: new Date().toISOString()
  });
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

  const current = (await getScanProgress(scanId)) ?? {
    phase: 'queued' as ScanStage,
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
  await redis.rpush(logsKey(scanId), JSON.stringify(makeEvent(stage, message)));
  await redis.expire(logsKey(scanId), SCAN_TTL_SECONDS);

  const meta = await getScanMeta(scanId);
  if (meta) {
    await setJson(metaKey(scanId), {
      ...meta,
      updatedAt: new Date().toISOString()
    });
  }
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

async function getScanMeta(scanId: string): Promise<StoredScanMeta | null> {
  const raw = await redis.get(metaKey(scanId));
  return raw ? parseJson<StoredScanMeta>(raw) : null;
}

async function getScanProgress(scanId: string): Promise<StoredScanProgress | null> {
  const raw = await redis.get(progressKey(scanId));
  return raw ? parseJson<StoredScanProgress>(raw) : null;
}

function makeEvent(stage: ScanStage, message: string): StatusEvent {
  return {
    id: randomUUID(),
    stage,
    message,
    createdAt: new Date().toISOString()
  };
}

async function setJson(key: string, value: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(value), { ex: SCAN_TTL_SECONDS });
}

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}
