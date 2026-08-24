// wxread curl_bash 获取器 —— 桥接脚本（isolated world）
// 职责：
//   1. 监听页面主世界 postMessage，把捕获的阅读请求转发给 service worker
//   2. 注入浮动面板到页面 DOM（Shadow DOM 隔离样式），点击外部不消失，右上角关闭按钮
//   3. 接收 background 的 toggle 消息，切换面板显隐
//   4. 读取 storage 展示 curl 结果与诊断
(() => {
  // ---- 消息转发：主世界 → service worker ----
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== 'wxread-curl-cap' || d.type !== 'captured') return;
    chrome.runtime.sendMessage({ type: 'captured', data: d.data }).catch(() => {});
  });

  // ---- 注入浮动面板 ----
  const PANEL_ID = '__wxread_curl_panel_host';
  let panelHost = document.getElementById(PANEL_ID);
  if (!panelHost) {
    panelHost = document.createElement('div');
    panelHost.id = PANEL_ID;
    document.documentElement.appendChild(panelHost);
    const shadow = panelHost.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        #panel {
          position: fixed;
          top: 16px;
          right: 16px;
          width: 460px;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 32px);
          overflow-y: auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          color: #222;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
          z-index: 2147483647;
          padding: 14px 16px 16px;
          display: none;
        }
        #panel.visible { display: block; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .title { font-size: 15px; font-weight: 600; }
        .close-btn {
          width: 28px; height: 28px; border: 0; border-radius: 50%;
          background: #f0f0f0; color: #666; font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; line-height: 1;
        }
        .close-btn:hover { background: #e0e0e0; }
        .tip { font-size: 12px; color: #888; margin: 0 0 10px; line-height: 1.6; }
        .status { font-size: 12px; padding: 6px 10px; border-radius: 6px; background: #f5f7fa; margin-bottom: 10px; }
        .status.ok { background: #e8f7ee; color: #1a7f37; }
        .status.err { background: #fdeaea; color: #cf222e; }
        textarea {
          width: 100%; height: 190px; box-sizing: border-box;
          font-family: Consolas, Monaco, monospace; font-size: 11px;
          padding: 8px; border: 1px solid #ddd; border-radius: 6px; resize: vertical;
        }
        .actions { display: flex; gap: 8px; margin-top: 10px; }
        button { flex: 1; padding: 8px 0; border: 0; border-radius: 6px; cursor: pointer; font-size: 13px; }
        #copy { background: #2b6ef2; color: #fff; }
        #copy:hover { opacity: .9; }
        #clear { background: #fff; color: #555; border: 1px solid #ddd; }
        #msg { font-size: 12px; color: #1a7f37; margin: 8px 0 0; min-height: 16px; }
        .warn { font-size: 12px; color: #e67e22; margin-top: 8px; line-height: 1.6; }
        #diag { font-size: 11px; color: #888; margin-top: 8px; word-break: break-all; line-height: 1.6; }
      </style>
      <div id="panel">
        <div class="header">
          <span class="title">🎣 wxread curl_bash 获取器</span>
          <button class="close-btn" id="close" title="关闭">✕</button>
        </div>
        <p class="tip">1. 在阅读页翻一页触发上报 → 2. 回到这里复制 curl_bash</p>
        <div id="status" class="status">⏳ 等待捕获… 请在阅读页翻一页</div>
        <textarea id="curl" readonly placeholder="翻页后自动生成完整 curl_bash（含 HttpOnly 登录凭证）…"></textarea>
        <div class="actions">
          <button id="copy">📋 复制 curl_bash</button>
          <button id="clear">清空</button>
        </div>
        <p id="msg"></p>
        <div class="warn" id="warn" style="display:none"></div>
        <div id="diag" style="display:none"></div>
      </div>
    `;

    const panel = shadow.getElementById('panel');
    const statusEl = shadow.getElementById('status');
    const curlEl = shadow.getElementById('curl');
    const msgEl = shadow.getElementById('msg');
    const warnEl = shadow.getElementById('warn');
    const diagEl = shadow.getElementById('diag');

    // 关闭按钮
    shadow.getElementById('close').addEventListener('click', () => {
      panel.classList.remove('visible');
    });

    // 复制按钮
    shadow.getElementById('copy').addEventListener('click', async () => {
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

    // 清空按钮
    shadow.getElementById('clear').addEventListener('click', () => {
      chrome.storage.local.remove(['lastCurl', 'lastCapturedAt', 'lastCookieKeys', 'lastCookieNames', 'lastError']);
      msgEl.textContent = '';
      refresh();
    });

    // 刷新面板内容
    function refresh() {
      chrome.storage.local.get(
        ['lastCurl', 'lastCapturedAt', 'lastCookieKeys', 'lastCookieNames', 'lastCookieCount', 'lastLoggedIn', 'lastError'],
        (r) => {
          if (r.lastError) {
            statusEl.textContent = '❌ ' + r.lastError;
            statusEl.className = 'status err';
            return;
          }
          if (r.lastCurl) {
            curlEl.value = r.lastCurl;
            const time = r.lastCapturedAt ? new Date(r.lastCapturedAt).toLocaleTimeString() : '';
            const keys = r.lastCookieKeys || [];
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
        }
      );
    }

    // storage 变化时自动刷新
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.lastCurl || changes.lastError)) refresh();
    });

    // 接收 background 的 toggle 消息（点击扩展图标时）
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'toggle-panel') {
        panel.classList.toggle('visible');
        if (panel.classList.contains('visible')) refresh();
        sendResponse({ shown: panel.classList.contains('visible') });
      }
    });

    refresh();
  }
})();
