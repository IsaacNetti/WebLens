import { appendScanLog, completeScan, failScan, setScanStatus, updateScanProgress } from './redis';
import { FinalScanResult, ScanStage, ScanStatus } from './types';

export async function logStage(scanId: string, stage: ScanStage, message: string): Promise<void> {
  await appendScanLog(scanId, stage, message);
}

export async function setStage(scanId: string, status: ScanStatus, stage: ScanStage, currentPage?: string): Promise<void> {
  await setScanStatus(scanId, status, stage, currentPage);
}

export async function setProgress(
  scanId: string,
  values: Partial<{ pagesDiscovered: number; pagesScanned: number; currentPage?: string; phase: ScanStage }>
): Promise<void> {
  await updateScanProgress(scanId, values);
}

export async function finishScan(scanId: string, result: FinalScanResult): Promise<void> {
  await completeScan(scanId, result);
}

export async function failWorkerScan(scanId: string, error: string): Promise<void> {
  await failScan(scanId, error);
}
