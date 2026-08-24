// wxread curl_bash 获取器 —— 后台 service worker
// 收到阅读请求捕获后：
//   1. chrome.cookies.getAll 读取完整 cookie（含 HttpOnly wr_vid/wr_skey/wr_rt——
//      这是扩展相对书签工具的决定性能力，页面 JS 永远拿不到这些）
//   2. 与捕获的请求头合并，生成与 F12 Copy as cURL 完全一致的完整 curl
//   3. 存入 chrome.storage.local，popup 读取展示 / 复制

// 需要被验证存在的关键 HttpOnly 登录凭证
const READ_COOKIE_KEYS = ['wr_vid', 'wr_skey', 'wr_rt', 'wr_ql', 'wr_localvid', 'wr_name', 'wr_avatar', 'wr_gender'];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'captured') {
    handleCaptured(msg.data).then(sendResponse);
    return true; // 异步响应
  }
});

async function handleCaptured(data) {
  try {
    // 1. 完整 cookie（含 HttpOnly）——cookies API 是扩展读取 HttpOnly 的唯一可靠途径。
    //    getAll({}) 不带 domain 过滤：① 规避带前导点 domain（.weread.qq.com）匹配的已知问题；
    //    ② host_permissions 已覆盖 weread.qq.com 与 qq.com 域，返回全部可访问 cookie
    //    （与 F12 复制的 curl 中的 cookie 串完全一致，含 QQ 登录态 RK/ptcz 等）。
    const cookies = await chrome.cookies.getAll({});
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // 2. 合并 headers：捕获的请求头 + 完整 cookie 覆盖（cookie 以 cookies API 为准）
    const headers = {};
    const src = data.headers || {};
    Object.keys(src).forEach(k => { headers[k] = src[k]; });
    if (cookieStr) headers.cookie = cookieStr;

    // 3. 生成完整 curl
    const curl = buildCurl({ url: data.url, headers, body: data.body });

    // 4. 保存 + 供 popup 展示（含 cookie 名单诊断）
    await chrome.storage.local.set({
      lastCurl: curl,
      lastCapturedAt: Date.now(),
      lastCookieKeys: READ_COOKIE_KEYS.filter(k => cookies.some(c => c.name === k)),
      lastCookieNames: cookies.map(c => c.name).sort(),
    });
    return { ok: true, curl };
  } catch (e) {
    await chrome.storage.local.set({ lastError: String((e && e.message) || e) });
    return { ok: false, error: String((e && e.message) || e) };
  }
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
