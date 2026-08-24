// wxread curl_bash 获取器 —— 弹窗逻辑
// 读取 background 存入的 lastCurl（含 HttpOnly 凭证的完整 curl），提供复制/清空。
const statusEl = document.getElementById('status');
const curlEl = document.getElementById('curl');
const msgEl = document.getElementById('msg');
const warnEl = document.getElementById('warn');
const diagEl = document.getElementById('diag');

function refresh() {
  chrome.storage.local.get(['lastCurl', 'lastCapturedAt', 'lastCookieKeys', 'lastCookieNames', 'lastError'], (r) => {
    if (r.lastError) {
      statusEl.textContent = '❌ 捕获出错：' + r.lastError;
      statusEl.className = 'status err';
      return;
    }
    if (r.lastCurl) {
      curlEl.value = r.lastCurl;
      const time = r.lastCapturedAt ? new Date(r.lastCapturedAt).toLocaleTimeString() : '';
      const keys = (r.lastCookieKeys || []);
      const missing = ['wr_skey', 'wr_vid', 'wr_rt'].filter(k => !keys.includes(k));
      statusEl.textContent = '✅ 已捕获 ' + time + (keys.length ? '，读到 HttpOnly 凭证：' + keys.join('、') : '');
      statusEl.className = 'status ok';
      warnEl.style.display = missing.length ? 'block' : 'none';
      warnEl.textContent = missing.length
        ? '⚠️ 未读到 ' + missing.join('、') + '（登录态可能已过期），请刷新阅读页重新登录后再试。若仍缺失，请改用 F12 方式获取。'
        : '';
      // 诊断：显示读取到的全部 cookie 名单
      if (r.lastCookieNames && r.lastCookieNames.length) {
        diagEl.style.display = 'block';
        diagEl.textContent = '已读取 ' + r.lastCookieNames.length + ' 个 cookie：' + r.lastCookieNames.join('、');
      } else {
        diagEl.style.display = 'block';
        diagEl.textContent = '⚠️ 未读到任何 cookie（请确认扩展已获取 weread.qq.com 访问权限，必要时重新加载扩展后刷新阅读页）';
      }
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
