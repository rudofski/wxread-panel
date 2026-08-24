// wxread curl_bash 获取器 —— 弹窗逻辑
// 读取 background 存入的 lastCurl（含 HttpOnly 凭证的完整 curl），提供复制/清空。
const statusEl = document.getElementById('status');
const curlEl = document.getElementById('curl');
const msgEl = document.getElementById('msg');
const warnEl = document.getElementById('warn');

function refresh() {
  chrome.storage.local.get(['lastCurl', 'lastCapturedAt', 'lastCookieKeys', 'lastError'], (r) => {
    if (r.lastError) {
      statusEl.textContent = '❌ 捕获出错：' + r.lastError;
      statusEl.className = 'status err';
      return;
    }
    if (r.lastCurl) {
      curlEl.value = r.lastCurl;
      const time = r.lastCapturedAt ? new Date(r.lastCapturedAt).toLocaleTimeString() : '';
      const keys = (r.lastCookieKeys || []).join('、');
      statusEl.textContent = '✅ 已捕获 ' + time + (keys ? '，含 HttpOnly 凭证：' + keys : '');
      statusEl.className = 'status ok';
      warnEl.style.display = keys.includes('wr_skey') ? 'none' : 'block';
      warnEl.textContent = keys.includes('wr_skey')
        ? ''
        : '⚠️ 未读到 wr_skey（登录态可能已过期），请刷新阅读页重新登录后再试。';
    } else {
      curlEl.value = '';
      statusEl.textContent = '⏳ 等待捕获… 请在阅读页翻一页';
      statusEl.className = 'status';
      warnEl.style.display = 'none';
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
  chrome.storage.local.remove(['lastCurl', 'lastCapturedAt', 'lastCookieKeys', 'lastError']);
  msgEl.textContent = '';
  refresh();
});

// background 捕获完成后自动刷新
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.lastCurl || changes.lastError)) refresh();
});

refresh();
