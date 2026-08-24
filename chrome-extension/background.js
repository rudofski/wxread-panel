// wxread curl_bash 获取器 —— 后台 service worker
// 核心改动（v0.1.9 根因修复）：
//   之前用 chrome.cookies API 读 cookie 不可靠——它按 host permission 匹配返回的集合
//   与浏览器『实际发送』的 Cookie 头不一致（实测漏掉全部 wr_*、ptcz、RK 登录 cookie）。
//   现改用 chrome.webRequest.onBeforeSendHeaders **观察**（MV3 非阻塞模式仍支持，
//   加上 'extraHeaders' 可读 Cookie 头）：捕获到的就是浏览器对该请求真实附加的
//   Cookie 头（含 HttpOnly），与 F12 显示/复制的 curl **严格同源**（同一请求）。
// 另修复：content 捕获的 url 是相对路径（'/web/book/read'），
//   生成的 curl 无 scheme/host 无法执行——补 resolveUrl 转绝对 URL。
// v0.1.10：点击扩展图标打开常驻独立窗口（不随点击外部消失），替代默认 popup。

// 需要被验证存在的关键 HttpOnly 登录凭证
const READ_COOKIE_KEYS = ['wr_vid', 'wr_skey', 'wr_rt', 'wr_ql', 'wr_localvid', 'wr_name', 'wr_avatar', 'wr_gender'];
// 微信读书登录态的必要键（用于弹窗诊断）
const LOGIN_COOKIE_KEYS = ['wr_skey', 'wr_vid', 'wr_rt', 'ptcz', 'RK', 'ptui_loginuin'];

// 最近一次 read 请求的真实 Cookie 头缓存（webRequest 观察获得）
let lastReadCookie = null; // { cookie, ts, url }

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    try {
      if (details.url.indexOf('/web/book/read') === -1) return;
      const headers = details.requestHeaders || [];
      const cookieHeader = headers.find(h => h.name.toLowerCase() === 'cookie');
      if (cookieHeader && cookieHeader.value) {
        lastReadCookie = { cookie: cookieHeader.value, ts: Date.now(), url: details.url };
      }
    } catch (e) { /* 忽略 */ }
  },
  { urls: ['*://weread.qq.com/web/book/read'] },
  ['requestHeaders', 'extraHeaders']
);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'captured') {
    handleCaptured(msg.data).then(sendResponse);
    return true; // 异步响应
  }
});

async function handleCaptured(data) {
  try {
    // content script 在 fetch 调用时同步捕获，webRequest 事件可能稍后才到；
    // 短暂等待以拿到本次请求的真实 Cookie 头。
    const cookieHeader = await waitForReadCookie();
    if (!cookieHeader) {
      await chrome.storage.local.set({
        lastError: '未能捕获到该请求的 Cookie 头（请确认阅读页已刷新、扩展已重新加载，再翻一页重试；或用 F12 方式）',
      });
      return { ok: false };
    }

    // 合并 headers：捕获的请求头 + 真实 Cookie 覆盖（以 webRequest 的为准）
    const headers = {};
    const src = data.headers || {};
    Object.keys(src).forEach(k => { headers[k] = src[k]; });
    headers.cookie = cookieHeader;

    // URL 相对路径 → 绝对（curl 需要有 scheme/host）
    const absoluteUrl = resolveUrl(data.url || '', 'https://weread.qq.com');

    // 生成完整 curl
    const curl = buildCurl({ url: absoluteUrl, headers, body: data.body });

    // 保存 + 供 popup 展示（含诊断）
    const names = cookieHeader.split(';').map(s => s.split('=')[0].trim()).filter(Boolean);
    const uniqNames = [...new Set(names)];
    await chrome.storage.local.set({
      lastCurl: curl,
      lastCapturedAt: Date.now(),
      lastCookieKeys: READ_COOKIE_KEYS.filter(k => uniqNames.includes(k)),
      lastCookieNames: uniqNames.sort(),
      lastLoggedIn: LOGIN_COOKIE_KEYS.some(k => uniqNames.includes(k)),
      lastCookieCount: uniqNames.length,
    });
    return { ok: true, curl };
  } catch (e) {
    await chrome.storage.local.set({ lastError: String((e && e.message) || e) });
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// 等待最近的 read 请求 Cookie（最多 ~1.5s），返回 null 表示未捕获到
function waitForReadCookie() {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (lastReadCookie && Date.now() - lastReadCookie.ts < 5000) {
        resolve(lastReadCookie.cookie);
        return;
      }
      if (Date.now() - started > 1500) { resolve(null); return; }
      setTimeout(tick, 100);
    };
    tick();
  });
}

// 相对路径 → 绝对 URL（与 src/utils/curlBuilder.ts resolveUrl 等价）
function resolveUrl(url, base) {
  const s = String(url || '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.indexOf('/') === 0) return base + s;
  return base + '/' + s;
}

// ---------- curl 构建（与 src/utils/curlBuilder.ts 等价的内联实现，扩展需自包含） ----------
function q(v) {
  return "'" + String(v).replace(/'/g, "'\\''") + "'";
}

function buildCurl({ url, headers, body }) {
  const skip = { host: 1, 'content-length': 1 };
  const names = [];
  const map = {};
  function add(name, value) {
    const key = String(name).trim().toLowerCase();
    if (!key || skip[key] || value == null) return;
    if (!(key in map)) names.push(key);
    map[key] = String(value);
  }
  Object.keys(headers || {}).forEach(k => add(k, headers[k]));
  const lines = ['curl ' + q(url) + ' \\'];
  names.forEach((name, i) => {
    const last = i === names.length - 1 && !body;
    lines.push('  -H ' + q(name + ': ' + map[name]) + (last ? '' : ' \\'));
  });
  if (body) lines.push('  --data-raw ' + q(body));
  return lines.join('\n');
}

// ============ 常驻独立窗口（替代默认 popup，不随点击外部消失） ============
const WIN_KEY = 'panelWinId';
const PANEL_URL = 'panel.html';
const W = 480, H = 520;

chrome.action.onClicked.addListener(async () => {
  const { [WIN_KEY]: winId } = await chrome.storage.local.get(WIN_KEY);
  if (winId) {
    try {
      await chrome.windows.get(winId);
      await chrome.windows.update(winId, { focused: true, state: 'normal' });
      return;
    } catch (e) { /* 窗口已关闭，重新创建 */ }
  }
  const win = await chrome.windows.create({
    url: PANEL_URL, type: 'popup', width: W, height: H, focused: true,
  });
  await chrome.storage.local.set({ [WIN_KEY]: win.id });
  chrome.windows.onRemoved.addListener(function onRemoved(closedId) {
    if (closedId === win.id) {
      chrome.storage.local.remove(WIN_KEY);
      chrome.windows.onRemoved.removeListener(onRemoved);
    }
  });
});
