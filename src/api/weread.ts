import axios from 'axios';

const SEARCH_URL = 'https://weread.qq.com/web/search/global';

export interface BookInfo { bookId: string; title: string; author: string; cover: string; }

export function isValidBookId(bookId: string): boolean {
  return /^[A-Za-z0-9]+$/.test(bookId);
}

export async function searchBooks(keyword: string, limit: number = 20): Promise<BookInfo[]> {
  const query = (keyword || '').trim();
  if (!query) return [];
  const resp = await axios.get(SEARCH_URL, { params: { keyword: query }, timeout: 10000 });
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