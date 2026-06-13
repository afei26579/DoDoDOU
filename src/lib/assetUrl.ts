function isLocalHost(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0'
    || hostname.startsWith('192.168.')
    || hostname.startsWith('10.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

export function getDisplayAssetUrl(value: string | null | undefined) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/uploads/')) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.pathname.startsWith('/uploads/') && isLocalHost(url.hostname)) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}
