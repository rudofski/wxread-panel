import axios from 'axios';

const WEREAD_SEARCH = 'https://weread.qq.com/web/search/global';
// weread.qq.com 未开放 CORS，GitHub Pages 部署后浏览器会拦截直连请求。
// 通过 VITE_WEREAD_PROXY 指定自建 Cloudflare Worker 代理地址（见 worker/ 目录）；
// 未配置时直连（本地开发可用，线上部署需配置）。
// 代理约定：<proxy>/web/search/global?keyword=... 原样转发到 weread.qq.com。
export function buildSearchUrl(keyword: string): string {
  const proxy = (import.meta.env.VITE_WEREAD_PROXY || '').trim().replace(/\/$/, '');
  if (!proxy) return `${WEREAD_SEARCH}?keyword=${encodeURIComponent(keyword)}`;
  return `${proxy}/web/search/global?keyword=${encodeURIComponent(keyword)}`;
}

export interface BookInfo { bookId: string; title: string; author: string; cover: string; }

export function isValidBookId(bookId: string): boolean {
  return /^[A-Za-z0-9]+$/.test(bookId);
}

export async function searchBooks(keyword: string, limit: number = 20): Promise<BookInfo[]> {
  const query = (keyword || '').trim();
  if (!query) return [];
  const resp = await axios.get(buildSearchUrl(query), { timeout: 10000 });
  const data = resp.data;
  const results: BookInfo[] = [];
  const seen = new Set<string>();
  for (const item of data.books || []) {
    const info = item?.bookInfo;
    if (!info) continue;
    const bookId = String(info.bookId || '').trim();
    const title = String(info.title || '').trim();
    if (!isValidBookId(bookId) || !title || seen.has(bookId)) continue;
    results.push({ bookId, title, author: String(info.author || '').trim(), cover: String(info.cover || '').trim() });
    seen.add(bookId);
    if (results.length >= limit) break;
  }
  return results;
}

export function serializeBookLibrary(books: { bookId: string; title: string; author: string; cover: string }[]): string {
  return JSON.stringify(
    books.filter(b => isValidBookId(b.bookId)).map(b => ({ bookId: b.bookId, title: b.title, author: b.author, cover: b.cover })),
    null, 2
  );
}

export function parseBookLibrary(value: string): { bookId: string; title: string; author: string; cover: string }[] {
  if (!value) return [];
  try {
    const raw = JSON.parse(value);
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const books: { bookId: string; title: string; author: string; cover: string }[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const bookId = String(item.bookId || '').trim();
      if (!isValidBookId(bookId) || seen.has(bookId)) continue;
      books.push({ bookId, title: String(item.title || bookId).trim(), author: String(item.author || '').trim(), cover: String(item.cover || '').trim() });
      seen.add(bookId);
    }
    return books;
  } catch { return []; }
}