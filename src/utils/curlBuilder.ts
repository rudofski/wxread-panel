export interface CapturedRequest {
  url: string;
  headers?: Record<string, string>;
  body?: string;
  documentCookie?: string;
  referer?: string;
  origin?: string;
  userAgent?: string;
}

const SKIPPED_HEADERS = new Set(['host', 'content-length']);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function normalizeHeaders(headers: Record<string, string>): Map<string, { name: string; value: string }> {
  const normalized = new Map<string, { name: string; value: string }>();
  for (const [name, value] of Object.entries(headers)) {
    const key = name.trim().toLowerCase();
    if (!key || SKIPPED_HEADERS.has(key) || value == null) continue;
    normalized.set(key, { name: key, value: String(value) });
  }
  return normalized;
}

export function buildCurl(request: CapturedRequest): string {
  const headers = normalizeHeaders(request.headers || {});

  if (!headers.has('cookie') && request.documentCookie) {
    headers.set('cookie', { name: 'cookie', value: request.documentCookie });
  }
  if (!headers.has('accept')) {
    headers.set('accept', { name: 'accept', value: 'application/json, text/plain, */*' });
  }
  if (request.body && !headers.has('content-type')) {
    headers.set('content-type', { name: 'content-type', value: 'application/json;charset=UTF-8' });
  }
  if (!headers.has('origin')) {
    headers.set('origin', { name: 'origin', value: request.origin || 'https://weread.qq.com' });
  }
  if (request.referer && !headers.has('referer')) {
    headers.set('referer', { name: 'referer', value: request.referer });
  }
  if (request.userAgent && !headers.has('user-agent')) {
    headers.set('user-agent', { name: 'user-agent', value: request.userAgent });
  }

  const lines = [`curl ${shellQuote(request.url)} \\`];
  const headerEntries = [...headers.values()];
  headerEntries.forEach((header, index) => {
    const suffix = index === headerEntries.length - 1 && !request.body ? '' : ' \\';
    lines.push(`  -H ${shellQuote(`${header.name}: ${header.value}`)}${suffix}`);
  });

  if (request.body) {
    lines.push(`  --data-raw ${shellQuote(request.body)}`);
  }

  return lines.join('\n');
}
