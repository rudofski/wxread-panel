// wxread curl_bash 获取器 —— 桥接脚本（isolated world）
// 监听页面主世界 postMessage，把捕获的阅读请求转发给扩展 service worker。
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const d = event.data;
  if (!d || d.source !== 'wxread-curl-cap' || d.type !== 'captured') return;
  chrome.runtime.sendMessage({ type: 'captured', data: d.data }).catch(() => {});
});
