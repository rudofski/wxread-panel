// wxread-panel 书城搜索 CORS 代理（Cloudflare Worker）
//
// 背景：weread.qq.com 的搜索接口未开放 CORS，GitHub Pages 上的纯前端
//       会被浏览器同源策略拦截。此 Worker 原样转发搜索请求并附加
//       CORS 响应头，仅代理 /web/search/global 一个路径，避免成为开放代理。
//
// 部署：见 worker/README.md
// 前端接入：面板构建时注入 VITE_WEREAD_PROXY=<本 Worker 地址>（见 deploy.yml）

const TARGET_ORIGIN = 'https://weread.qq.com';
const ALLOWED_PATH = '/web/search/global';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // 仅代理搜索接口
    if (request.method !== 'GET' || !url.pathname.startsWith(ALLOWED_PATH)) {
      return new Response('Not Found', { status: 404 });
    }

    const target = TARGET_ORIGIN + url.pathname + url.search;

    try {
      const upstream = await fetch(target, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'wxread-panel',
        },
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: '代理请求失败' }), {
        status: 502,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  },
};
