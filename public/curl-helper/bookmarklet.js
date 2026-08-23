/**
 * wxread curl_bash 书签小工具源码
 *
 * 原理：在微信读书阅读页注入 fetch/XHR 拦截器，捕获真实的阅读上报请求
 * （/web/book/read），从而拿到浏览器实际发送的请求头（含 x-wrpa-0 签名头）
 * 与请求体（阅读进度 JSON）——旧版本只抓 document.cookie，缺失 x-wrpa-0、
 * --data-raw 请求体与 content-type，导致提取的 curl 无法正常上报。
 *
 * 使用方式：
 *   1. 将 index.html 中的压缩版保存为浏览器书签
 *   2. 在微信读书网页版（weread.qq.com）登录并打开任意一本书的阅读页
 *   3. 点击书签 → 在阅读页翻一页（触发阅读上报）→ 自动捕获并复制 curl_bash
 *   4. 粘贴到 wxread 控制面板 → 配置参数 → 微信读书接口
 *
 * 注意：浏览器出于安全限制不向 JS 暴露 HttpOnly cookie（如 wr_skey）。
 * 若生成的 curl 仍无法上报，请用 F12 → Network → Copy as cURL (bash) 方式。
 */
(function () {
  if (window.__wxreadCurlCap) { window.__wxreadCurlCap.show(); return; }

  var captured = null;
  var panel = null;
  var statusEl = null;
  var textEl = null;
  var timer = null;
  var copyBtn = null;
  var guideBtn = null;

  function isReadUrl(u) {
    return typeof u === 'string' && u.indexOf('/web/book/read') !== -1;
  }

  function pickHeaders(h) {
    var out = {};
    if (!h) return out;
    if (typeof h.forEach === 'function') { h.forEach(function (v, k) { out[k] = v; }); }
    else if (typeof h === 'object') { Object.keys(h).forEach(function (k) { out[k] = h[k]; }); }
    return out;
  }

  function bodyToString(b) {
    if (b == null) return '';
    if (typeof b === 'string') return b;
    if (typeof Blob !== 'undefined' && b instanceof Blob) return '';
    try { return String(b); } catch (e) { return ''; }
  }

  // hook 到的 URL 可能是相对路径（如 '/web/book/read'），curl 无法解析无 scheme 的地址，
  // 必须补全为绝对 URL（v0.1.5 修复——此前相对 URL 导致 curl 直接失败）
  function resolveUrl(u) {
    u = String(u || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('/') === 0) return location.origin + u;
    return location.origin + '/' + u;
  }

  function capture(url, headers, body, method) {
    if (!isReadUrl(url)) return;
    var h = pickHeaders(headers);
    var b = bodyToString(body);
    if (method === 'GET') b = '';
    captured = { url: resolveUrl(url), headers: h, body: b };
    showResult();
  }

  // ---- hook fetch ----
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && (input.url || '')) || '';
      var h = (init && init.headers) || {};
      var b = (init && init.body);
      var m = (init && init.method) || 'GET';
      try { capture(url, h, b, m); } catch (e) {}
      return origFetch.apply(this, arguments);
    };
  }

  // ---- hook XHR ----
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._wcM = method; this._wcU = url; this._wcH = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this._wcH) this._wcH[k] = v;
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try { if (this._wcH) capture(this._wcU, this._wcH, body, this._wcM); } catch (e) {}
    return origSend.apply(this, arguments);
  };

  // ---- 构建 curl（与 src/utils/curlBuilder.ts 保持一致）----
  function shellQuote(v) { return "'" + String(v).replace(/'/g, "'\\''") + "'"; }

  // 浏览器自动附加、但 JS 读不到的头（Client Hints / Fetch Metadata）——
  // F12 Copy as cURL 会包含，这里按浏览器实际行为补齐使格式一致（v0.1.6）
  function browserHeaders() {
    var out = {};
    var ua = navigator.userAgent || '';
    var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : ['zh-CN', 'zh'];
    out['accept-language'] = langs.map(function (l, i) {
      return i === 0 ? l : l + ';q=' + Math.max(0.1, 0.9 - (i - 1) * 0.1).toFixed(1);
    }).join(',');
    out['dnt'] = navigator.doNotTrack === '1' ? '1' : '0';
    out['priority'] = 'u=1, i';
    out['sec-fetch-dest'] = 'empty';
    out['sec-fetch-mode'] = 'cors';
    out['sec-fetch-site'] = 'same-origin';
    var cm = ua.match(/Chrome\/(\d+)/);
    var ud = navigator.userAgentData;
    var platform = (ud && ud.platform) || (ua.indexOf('Windows') > -1 ? 'Windows' : ua.indexOf('Android') > -1 ? 'Android' : ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1 ? 'iOS' : ua.indexOf('Mac') > -1 ? 'macOS' : ua.indexOf('Linux') > -1 ? 'Linux' : '');
    var mobile = (ud && ud.mobile != null) ? ud.mobile : /Mobile|Android/i.test(ua);
    out['sec-ch-ua-mobile'] = mobile ? '?1' : '?0';
    if (platform) out['sec-ch-ua-platform'] = '"' + platform + '"';
    if (cm) out['sec-ch-ua'] = '"Not A(Brand";v="8", "Chromium";v="' + cm[1] + '", "Google Chrome";v="' + cm[1] + '"';
    return out;
  }

  function buildCurl(req) {
    var SKIP = { host: 1, 'content-length': 1 };
    var map = {}; var order = [];
    function add(name, value) {
      var key = String(name).trim().toLowerCase();
      if (!key || SKIP[key] || value == null) return;
      if (!(key in map)) order.push(key);
      map[key] = { n: key, v: String(value) };
    }
    var h = req.headers || {};
    Object.keys(h).forEach(function (k) { add(k, h[k]); });

    // cookie：优先捕获请求中的，并把 document.cookie 里缺失的项补进去
    var cookie = map.cookie ? map.cookie.v : '';
    var dc = document.cookie || '';
    if (dc) {
      if (cookie) {
        var have = {};
        cookie.split(';').forEach(function (p) { var i = p.indexOf('='); if (i > 0) have[p.slice(0, i).trim()] = 1; });
        var extra = [];
        dc.split(';').forEach(function (p) {
          var i = p.indexOf('='); var n = i > 0 ? p.slice(0, i).trim() : '';
          if (n && !have[n]) extra.push(p.trim());
        });
        if (extra.length) cookie = cookie + '; ' + extra.join('; ');
      } else { cookie = dc; }
    }
    if (cookie) add('cookie', cookie);

    add('accept', 'application/json, text/plain, */*');
    if (req.body) add('content-type', 'application/json;charset=UTF-8');
    add('origin', 'https://weread.qq.com');
    if (location && location.href) add('referer', location.href);
    add('user-agent', navigator.userAgent);
    var auto = browserHeaders();
    Object.keys(auto).forEach(function (k) { add(k, auto[k]); });

    var lines = ['curl ' + shellQuote(req.url) + ' \\'];
    order.forEach(function (k, i) {
      var suffix = (i === order.length - 1 && !req.body) ? '' : ' \\';
      lines.push('  -H ' + shellQuote(map[k].n + ': ' + map[k].v) + suffix);
    });
    if (req.body) lines.push('  --data-raw ' + shellQuote(req.body));
    return lines.join('\n');
  }

  // ---- 浮层 UI ----
  function setStatus(msg, color) {
    statusEl.textContent = msg;
    statusEl.style.color = color || '#555';
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { setStatus('✅ 已复制到剪贴板', '#27ae60'); })
        .catch(function () { fallbackCopy(t); });
    } else { fallbackCopy(t); }
  }

  function fallbackCopy(t) {
    try {
      textEl.select(); textEl.setSelectionRange(0, 999999);
      document.execCommand('copy');
      setStatus('✅ 已复制到剪贴板', '#27ae60');
    } catch (e) { setStatus('复制失败，请手动选中复制', '#c0392b'); }
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:24px;right:24px;z-index:2147483647;width:620px;max-width:94vw;background:#fff;border:1px solid #d0d0d0;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:16px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#222;line-height:1.6;';
    var title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;';
    var titleText = document.createElement('span');
    titleText.textContent = '🎣 wxread curl 捕获工具';
    var close = document.createElement('a');
    close.href = 'javascript:void(0)';
    close.textContent = '✕';
    close.style.cssText = 'color:#888;text-decoration:none;font-size:16px;';
    close.addEventListener('click', function () { panel.style.display = 'none'; });
    title.appendChild(titleText); title.appendChild(close);
    statusEl = document.createElement('div');
    statusEl.style.cssText = 'margin-bottom:8px;color:#555;';
    setStatus('正在监听… 请在阅读页翻一页，触发阅读上报（自动捕获）');
    textEl = document.createElement('textarea');
    textEl.style.cssText = 'width:100%;height:200px;box-sizing:border-box;font-family:Consolas,Monaco,monospace;font-size:11px;padding:8px;border:1px solid #ddd;border-radius:6px;resize:vertical;';
    textEl.readOnly = true;
    var btns = document.createElement('div');
    btns.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
    copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 复制 curl_bash';
    copyBtn.style.cssText = 'padding:6px 14px;background:#2b6ef2;color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:13px;';
    copyBtn.addEventListener('click', function () { copyText(textEl.value); });
    guideBtn = document.createElement('button');
    guideBtn.textContent = '❓ F12 指引（复制步骤）';
    guideBtn.style.cssText = 'padding:6px 14px;background:#fff;color:#e67e22;border:1px solid #e67e22;border-radius:6px;cursor:pointer;font-size:13px;';
    guideBtn.style.display = 'none';
    guideBtn.addEventListener('click', function () { copyText(F12_GUIDE); });
    var reBtn = document.createElement('button');
    reBtn.textContent = '🔄 重新监听';
    reBtn.style.cssText = 'padding:6px 14px;background:#fff;color:#333;border:1px solid #ccc;border-radius:6px;cursor:pointer;font-size:13px;';
    reBtn.addEventListener('click', function () {
      captured = null; textEl.value = '';
      setStatus('正在监听… 请翻页触发阅读上报');
      startTimer();
    });
    btns.appendChild(copyBtn); btns.appendChild(guideBtn); btns.appendChild(reBtn);
    panel.appendChild(title); panel.appendChild(statusEl); panel.appendChild(textEl); panel.appendChild(btns);
    document.body.appendChild(panel);
  }

  function startTimer() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!captured) setStatus('⏳ 60 秒内未捕获到阅读请求：请确认已打开阅读页并翻页', '#c0392b');
    }, 60000);
  }

  function missingKeys(cookieStr) {
    var have = {};
    String(cookieStr || '').split(';').forEach(function (p) { var i = p.indexOf('='); if (i > 0) have[p.slice(0, i).trim()] = 1; });
    var keys = ['wr_vid', 'wr_skey', 'wr_rt'];
    return keys.filter(function (k) { return !have[k]; });
  }

  // 微信读书将关键 cookie 设为 HttpOnly，浏览器禁止任何网页脚本读取（含本工具）。
  // 这是安全硬限制，无法绕过——书签工具生成的 curl 必然缺少这些项，填入后
  // wxread 的 main.py 刷新 wr_skey 会失败。唯一可靠方式：F12 复制完整请求。
  var F12_GUIDE = '微信读书将 wr_vid / wr_skey / wr_rt 设为 HttpOnly，浏览器禁止网页脚本读取（安全硬限制，任何书签工具都无法绕过）。\n\n请用 F12 方式获取完整 curl（唯一可靠）：\n1. 微信读书阅读页按 F12，切到 Network 标签\n2. 过滤框输入 read，然后翻一页\n3. 右键 read 请求 → Copy → Copy as cURL (bash)\n4. 粘贴到控制面板配置参数页的 WXREAD_CURL_BASH 并保存';

  function showResult() {
    clearTimeout(timer);
    var bash = buildCurl(captured);
    textEl.value = bash;
    var missing = missingKeys(captured.headers.cookie || document.cookie);
    if (missing.length) {
      setStatus('⚠️ 缺少 ' + missing.join('、') + '（HttpOnly 安全限制，书签无法读取）——此 curl 不能用于刷时长。请点击下方「F12 指引」复制步骤', '#e67e22');
      // 不自动复制无效的 curl，改而提示用户使用 F12
      guideBtn.style.display = 'inline-block';
      copyBtn.style.display = 'none';
    } else {
      setStatus('✅ 已捕获阅读请求！请复制 curl_bash 并粘贴到控制面板', '#27ae60');
      guideBtn.style.display = 'none';
      copyBtn.style.display = 'inline-block';
      setTimeout(function () { copyText(bash); }, 300);
    }
  }

  window.__wxreadCurlCap = {
    show: function () { ensurePanel(); panel.style.display = 'block'; },
  };

  ensurePanel();
  startTimer();
})();
