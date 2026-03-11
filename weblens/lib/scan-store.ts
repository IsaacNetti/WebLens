import { randomUUID } from 'node:crypto';

import { FinalScanResult, ScanSnapshot, ScanStage, ScanStatus, StatusEvent } from '@/lib/types';

const RETENTION_MS = 1000 * 60 * 60;

declare global {
  var __siteScoreStore: Map<string, ScanSnapshot> | undefined;
}

// A global Map is the simplest way to share scan state between route handlers
// in local development. This is intentionally local-first, not durable storage.
const store = globalThis.__siteScoreStore ?? new Map<string, ScanSnapshot>();
globalThis.__siteScoreStore = store;

export function createScan(targetUrl: string, domain: string, maxPages: number): ScanSnapshot {
  pruneExpiredScans();

  const now = new Date().toISOString();
  const id = randomUUID();

  const snapshot: ScanSnapshot = {
    id,
    targetUrl,
    domain,
    createdAt: now,
    updatedAt: now,
    status: 'queued',
    stage: 'queued',
    maxPages,
    pagesDiscovered: 0,
    pagesScanned: 0,
    logs: [makeEvent('queued', 'Scan queued.')]
  };

  store.set(id, snapshot);
  return snapshot;
}

export function getScan(scanId: string): ScanSnapshot | undefined {
  pruneExpiredScans();
  return store.get(scanId);
}

export function setScanStatus(scanId: string, status: ScanStatus, stage: ScanStage, currentPage?: string): void {
  updateScan(scanId, (scan) => {
    scan.status = status;
    scan.stage = stage;
    scan.currentPage = currentPage;
  });
}

export function updateProgress(scanId: string, values: Partial<Pick<ScanSnapshot, 'pagesDiscovered' | 'pagesScanned' | 'currentPage'>>): void {
  updateScan(scanId, (scan) => {
    if (typeof values.pagesDiscovered === 'number') {
      scan.pagesDiscovered = values.pagesDiscovered;
    }

    if (typeof values.pagesScanned === 'number') {
      scan.pagesScanned = values.pagesScanned;
    }

    if (typeof values.currentPage === 'string' || values.currentPage === undefined) {
      scan.currentPage = values.currentPage;
    }
  });
}

export function addScanLog(scanId: string, stage: ScanStage, message: string): void {
  updateScan(scanId, (scan) => {
    scan.stage = stage;
    scan.logs.push(makeEvent(stage, message));
  });
}

export function completeScan(scanId: string, result: FinalScanResult): void {
  updateScan(scanId, (scan) => {
    scan.status = 'completed';
    scan.stage = 'completed';
    scan.result = result;
    scan.error = undefined;
    scan.currentPage = undefined;
    scan.pagesDiscovered = result.pagesDiscovered;
    scan.pagesScanned = result.pagesScanned;
    scan.logs.push(makeEvent('completed', 'Scan finished.'));
  });
}

export function failScan(scanId: string, error: string): void {
  updateScan(scanId, (scan) => {
    scan.status = 'failed';
    scan.stage = 'failed';
    scan.error = error;
    scan.currentPage = undefined;
    scan.logs.push(makeEvent('failed', error));
  });
}

function updateScan(scanId: string, mutator: (scan: ScanSnapshot) => void): void {
  const existing = store.get(scanId);

  if (!existing) {
    return;
  }

  mutator(existing);
  existing.updatedAt = new Date().toISOString();
  store.set(scanId, existing);
}

function makeEvent(stage: ScanStage, message: string): StatusEvent {
  return {
    id: randomUUID(),
    stage,
    message,
    createdAt: new Date().toISOString()
  };
}

function pruneExpiredScans(): void {
  const now = Date.now();

  for (const [id, scan] of store.entries()) {
    const age = now - new Date(scan.updatedAt).getTime();
    if (age > RETENTION_MS) {
      store.delete(id);
    }
  }
}
