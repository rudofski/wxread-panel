// wxread curl_bash 获取器 —— 页面主世界注入（world: MAIN）
// hook fetch / XHR，捕获 /web/book/read 阅读上报请求（含 x-wrpa-0 签名头与请求体），
// 通过 postMessage 转发给桥接脚本（content-bridge.js）。
// 说明：页面 JS 拿不到 HttpOnly cookie，但 x-wrpa-0 签名头与请求体由页面 JS 生成，这里能捕获；
// HttpOnly cookie（wr_vid/wr_skey/wr_rt）由 background.js 通过 chrome.cookies API 补全。
(() => {
  if (window.__wxreadCurlCapInstalled) return;
  window.__wxreadCurlCapInstalled = true;

  const TARGET = '/web/book/read';

  function isReadRequest(url) {
    return typeof url === 'string' && url.indexOf(TARGET) !== -1;
  }

  function normalizeHeaders(headers) {
    const out = {};
    if (!headers) return out;
    if (typeof headers.forEach === 'function') {
      headers.forEach((v, k) => { out[k] = v; });
    } else if (typeof headers === 'object') {
      Object.keys(headers).forEach(k => { out[k] = headers[k]; });
    }
    return out;
  }

  function bodyToString(body) {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    if (typeof Blob !== 'undefined' && body instanceof Blob) return '';
    try { return String(body); } catch (e) { return ''; }
  }

  function capture(url, headers, body, method) {
    if (!isReadRequest(url)) return;
    try {
      window.postMessage({
        source: 'wxread-curl-cap',
        type: 'captured',
        data: {
          url,
          headers: normalizeHeaders(headers),
          body: method === 'GET' ? '' : bodyToString(body),
        },
      }, '*');
    } catch (e) { /* 忽略 */ }
  }

  // ---- hook fetch ----
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const headers = (init && init.headers) || {};
      const body = init && init.body;
      const method = (init && init.method) || 'GET';
      try { capture(url, headers, body, method); } catch (e) { /* 忽略 */ }
      return origFetch.apply(this, arguments);
    };
  }

  // ---- hook XHR ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__capUrl = url;
    this.__capMethod = method;
    this.__capHeaders = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (this.__capHeaders) this.__capHeaders[k] = v; } catch (e) { /* 忽略 */ }
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      capture(this.__capUrl, this.__capHeaders || {}, body, this.__capMethod);
    } catch (e) { /* 忽略 */ }
    return origSend.apply(this, arguments);
  };
})();
