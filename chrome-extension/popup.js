// wxread curl_bash 获取器 —— 弹窗逻辑
// 读取 background 存入的 lastCurl（含 HttpOnly 凭证的完整 curl），提供复制/清空。
const statusEl = document.getElementById('status');
const curlEl = document.getElementById('curl');
const msgEl = document.getElementById('msg');
const warnEl = document.getElementById('warn');
const diagEl = document.getElementById('diag');

function refresh() {
  chrome.storage.local.get(['lastCurl', 'lastCapturedAt', 'lastCookieKeys', 'lastCookieNames', 'lastCookieCount', 'lastLoggedIn', 'lastError'], (r) => {
    if (r.lastError) {
      statusEl.textContent = '❌ ' + r.lastError;
      statusEl.className = 'status err';
      return;
    }
    if (r.lastCurl) {
      curlEl.value = r.lastCurl;
      const time = r.lastCapturedAt ? new Date(r.lastCapturedAt).toLocaleTimeString() : '';
      const keys = (r.lastCookieKeys || []);
      const missing = ['wr_skey', 'wr_vid', 'wr_rt'].filter(k => !keys.includes(k));
      statusEl.textContent = '✅ 已捕获 ' + time + (keys.length ? '，读到的登录凭证：' + keys.join('、') : '');
      statusEl.className = 'status ok';
      if (missing.length) {
        warnEl.style.display = 'block';
        warnEl.textContent = '⚠️ 未检测到微信读书登录态（缺少 ' + missing.join('、') + '）';
      } else {
        warnEl.style.display = 'none';
      }
      const n = r.lastCookieCount || (r.lastCookieNames || []).length;
      diagEl.style.display = 'block';
      diagEl.textContent = '已捕获 ' + n + ' 个 cookie（真实请求头，含 HttpOnly）：' + (r.lastCookieNames || []).join('、');
    } else {
      curlEl.value = '';
      statusEl.textContent = '⏳ 等待捕获… 请在阅读页翻一页';
      statusEl.className = 'status';
      warnEl.style.display = 'none';
      diagEl.style.display = 'none';
    }
  });
}

document.getElementById('copy').addEventListener('click', async () => {
  if (!curlEl.value.trim()) { msgEl.textContent = '还没有捕获内容'; return; }
  try {
    await navigator.clipboard.writeText(curlEl.value);
    msgEl.textContent = '✅ 已复制到剪贴板';
  } catch (e) {
    curlEl.select();
    document.execCommand('copy');
    msgEl.textContent = '✅ 已复制（兼容模式）';
  }
});

document.getElementById('clear').addEventListener('click', () => {
  chrome.storage.local.remove(['lastCurl', 'lastCapturedAt', 'lastCookieKeys', 'lastCookieNames', 'lastError']);
  msgEl.textContent = '';
  refresh();
});

// background 捕获完成后自动刷新
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.lastCurl || changes.lastError)) refresh();
});

refresh();
