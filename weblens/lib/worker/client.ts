const WORKER_REQUEST_TIMEOUT_MS = 10_000;

export async function dispatchScanToWorker(input: {
  scanId: string;
  url: string;
  maxPages: number;
}): Promise<void> {
  const workerUrl = process.env.WORKER_URL;

  if (!workerUrl) {
    throw new Error('WORKER_URL is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/scans/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.WORKER_SHARED_SECRET
          ? { Authorization: `Bearer ${process.env.WORKER_SHARED_SECRET}` }
          : {})
      },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: 'no-store'
    });

    const payload = (await response.json().catch(() => null)) as { accepted?: boolean; error?: string } | null;

    if (!response.ok || !payload?.accepted) {
      throw new Error(payload?.error ?? 'Worker did not accept the scan.');
    }
  } finally {
    clearTimeout(timeout);
  }
}
