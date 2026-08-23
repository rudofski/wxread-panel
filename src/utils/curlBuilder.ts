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

// 书签工具 hook 到的 fetch/XHR URL 可能是相对路径（如 '/web/book/read'），
// curl 无法解析无 scheme 的相对路径，必须补全为绝对 URL（v0.1.5 修复）。
export function resolveUrl(url: string, origin: string): string {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${origin}${u}`;
  return `${origin}/${u}`;
}

export interface BrowserHeaderInput {
  userAgent: string;
  platform?: string;
  mobile?: boolean;
  languages?: string[];
  doNotTrack?: string | null;
}

// 浏览器自动附加、但 JS 无法从请求头读到的头（Client Hints / Fetch Metadata 等）。
// F12 的 Copy as cURL 会包含它们；书签 hook 只能拿到 JS 显式设置的头，
// 因此在生成 curl 时按浏览器实际行为补齐，使格式与 F12 一致（v0.1.6）。
export function browserHeaders(input: BrowserHeaderInput): Record<string, string> {
  const out: Record<string, string> = {};
  const ua = input.userAgent || '';

  const langs = input.languages?.length ? input.languages : ['zh-CN', 'zh'];
  // 浏览器实际格式：第一个语言无 q（默认 1.0），其后依次 0.9 / 0.8 ...
  out['accept-language'] = langs.map((l, i) => (i === 0 ? l : `${l};q=${Math.max(0.1, 0.9 - (i - 1) * 0.1).toFixed(1)}`)).join(',');

  out['dnt'] = input.doNotTrack === '1' ? '1' : '0';
  out['priority'] = 'u=1, i';
  out['sec-fetch-dest'] = 'empty';
  out['sec-fetch-mode'] = 'cors';
  out['sec-fetch-site'] = 'same-origin';

  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  const platform = input.platform || (ua.includes('Windows') ? 'Windows' : ua.includes('Android') ? 'Android' : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS' : ua.includes('Mac') ? 'macOS' : ua.includes('Linux') ? 'Linux' : '');
  const mobile = input.mobile ?? /Mobile|Android/i.test(ua);
  out['sec-ch-ua-mobile'] = mobile ? '?1' : '?0';
  if (platform) out['sec-ch-ua-platform'] = `"${platform}"`;
  if (chromeMatch) {
    const major = chromeMatch[1];
    out['sec-ch-ua'] = `"Not A(Brand";v="8", "Chromium";v="${major}", "Google Chrome";v="${major}"`;
  }
  return out;
}

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
