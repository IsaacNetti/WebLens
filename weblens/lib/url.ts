import { ValidationResult } from '@/lib/types';

const NON_HTML_EXTENSIONS = /\.(?:png|jpe?g|gif|svg|webp|ico|pdf|zip|rar|mp4|mp3|wav|mov|avi|webm|xml|json|txt|css|js|mjs|map|woff2?|ttf|eot)$/i;

export function normalizePublicUrl(rawInput: string): ValidationResult {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return { ok: false, error: 'Enter a URL or bare domain.' };
  }

  // Bare domains like example.com are normalized to https://example.com
  // so the rest of the app can work with a single canonical format.
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, error: 'Only http and https URLs are supported.' };
  }

  if (!url.hostname) {
    return { ok: false, error: 'The URL must include a hostname.' };
  }

  if (!isAllowedPublicHostname(url.hostname)) {
    return {
      ok: false,
      error: 'Use a public hostname. Localhost and obvious private-network hosts are blocked in this version.'
    };
  }

  // Hash fragments do not change the fetched document for our crawler.
  url.hash = '';

  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  return {
    ok: true,
    value: url.toString(),
    domain: url.hostname
  };
}

export function isLikelyHtmlUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return !NON_HTML_EXTENSIONS.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeCrawlUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    // Hash fragments do not change the fetched document for our crawler.
  url.hash = '';

    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function shouldVisitLink(candidateUrl: string, origin: string): boolean {
  const normalized = normalizeCrawlUrl(candidateUrl);

  if (!normalized) {
    return false;
  }

  const url = new URL(normalized);

  if (url.origin !== origin) {
    return false;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }

  return isLikelyHtmlUrl(normalized);
}

export function toDisplayDomain(targetUrl: string): string {
  try {
    return new URL(targetUrl).hostname;
  } catch {
    return targetUrl;
  }
}

function isAllowedPublicHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (lower === 'localhost' || lower.endsWith('.local')) {
    return false;
  }

  if (/^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower)) {
    return false;
  }

  const match172 = lower.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return false;
    }
  }

  return true;
}
