const NON_HTML_EXTENSIONS = /\.(?:png|jpe?g|gif|svg|webp|ico|pdf|zip|rar|mp4|mp3|wav|mov|avi|webm|xml|json|txt|css|js|mjs|map|woff2?|ttf|eot)$/i;

export function normalizeCrawlUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
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

  return !NON_HTML_EXTENSIONS.test(url.pathname);
}
