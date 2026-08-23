// 可选密码门：构建时配置 VITE_PANEL_PASSWORD_HASH（密码的 SHA-256 hex）后启用，
// 打开面板需先输入访问密码（防共用设备场景）。
//
// 安全边界：前端校验可被绕过，仅作第一道门，真正的防线仍是 PAT token。
// 构建产物中仅含密码的 SHA-256 哈希，不含明文（Vite 会把 VITE_ 变量内联进 JS，
// 因此注入的是哈希而非明文）。

const UNLOCK_KEY = 'panel_unlocked_at';
const UNLOCK_TTL_MS = 24 * 3600 * 1000;

export async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isLockEnabled(): boolean {
  return !!((import.meta.env.VITE_PANEL_PASSWORD_HASH || '').trim());
}

export async function verifyPassword(input: string): Promise<boolean> {
  const expected = (import.meta.env.VITE_PANEL_PASSWORD_HASH || '').trim();
  if (!expected) return true; // 未启用时不拦截
  const inputHash = await sha256Hex(input);
  return inputHash === expected;
}

export function isUnlocked(): boolean {
  const at = Number(localStorage.getItem(UNLOCK_KEY) || 0);
  return Date.now() - at < UNLOCK_TTL_MS;
}

export function setUnlocked(): void {
  localStorage.setItem(UNLOCK_KEY, String(Date.now()));
}
