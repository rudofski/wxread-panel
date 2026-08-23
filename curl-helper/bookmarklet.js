/**
 * wxread curl_bash 书签小工具源码
 *
 * 使用方式：
 *   1. 将下方压缩版保存为浏览器书签（书签 URL）
 *   2. 在微信读书网页版（weread.qq.com）登录并打开任意一本书
 *   3. 点击书签 → 自动提取 cookies → 生成 curl_bash → 复制到剪贴板
 *   4. 粘贴到 wxread 控制面板 → 配置 → 登录方式 → WXREAD_CURL_BASH
 *
 * 压缩版（index.html 中使用的内嵌版本）：
 * javascript:(function(){var c=document.cookie;if(!c){alert('请先在微信读书官网扫码登录');return;}var u=navigator.userAgent;var b='curl '+String.fromCharCode(39)+'https://weread.qq.com/web/book/read'+String.fromCharCode(39)+' -H '+String.fromCharCode(39)+'accept: application/json, text/plain, */*'+String.fromCharCode(39)+' -H '+String.fromCharCode(39)+'user-agent: '+u+String.fromCharCode(39)+' -b '+String.fromCharCode(39)+c+String.fromCharCode(39);navigator.clipboard.writeText(b).then(function(){alert('curl_bash 已复制到剪贴板');}).catch(function(){var t=document.createElement('textarea');t.value=b;t.style.position='fixed';t.style.left='-9999px';document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);alert('curl_bash 已复制到剪贴板');});})();
 */

(function () {
  var cookies = document.cookie;
  if (!cookies) {
    alert('❌ 未检测到登录信息，请先在微信读书官网扫码登录');
    return;
  }
  var ua = navigator.userAgent;
  var bash =
    "curl 'https://weread.qq.com/web/book/read' " +
    "-H 'accept: application/json, text/plain, */*' " +
    "-H 'user-agent: " + ua + "' " +
    "-b '" + cookies + "'";

  navigator.clipboard
    .writeText(bash)
    .then(function () {
      alert('✅ curl_bash 已复制到剪贴板！粘贴到控制面板即可。');
    })
    .catch(function () {
      // 剪贴板 API 不可用时的降级方案
      var ta = document.createElement('textarea');
      ta.value = bash;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, 99999);
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('✅ curl_bash 已复制到剪贴板！粘贴到控制面板即可。');
    });
})();
