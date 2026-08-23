# wxread-search-proxy（Cloudflare Worker）

微信读书书城搜索的 CORS 代理。`weread.qq.com` 搜索接口未开放 CORS，
GitHub Pages 上的面板无法在浏览器中直连，需经本 Worker 转发。

## 为什么需要

- 公共 CORS 代理（allorigins / codetabs / corsproxy）在国内网络多不可达或需付费
- 自建 Worker 可控、国内可访问、无额外依赖

## 部署

### 方式一：Wrangler CLI（推荐）

```bash
# 安装并登录（需 Cloudflare 账号）
npm install -g wrangler
wrangler login

# 在本目录部署
cd worker
wrangler deploy
```

部署成功后输出类似 `https://wxread-search-proxy.<你的子域>.workers.dev`。

### 方式二：Dashboard 粘贴

1. 打开 [Cloudflare Dashboard → Workers & Pages → Create → Worker](https://dash.cloudflare.com/)
2. 删除默认模板，粘贴 `index.js` 内容，Deploy
3. 记下 Worker 地址

## 接入面板

1. 在 GitHub 仓库 `Settings → Secrets and variables → Actions → Variables` 添加：
   - `VITE_WEREAD_PROXY` = `https://wxread-search-proxy.<你的子域>.workers.dev`
2. 重新触发部署（push 或 Actions 手动运行）。`deploy.yml` 会在构建时注入该变量，
   面板书城搜索即走代理。

## 本地开发

不配置 `VITE_WEREAD_PROXY` 时面板直连 `weread.qq.com`，本地开发可用；
仅 GitHub Pages 线上部署需要代理。

## 验证

```bash
curl 'https://wxread-search-proxy.<你的子域>.workers.dev/web/search/global?keyword=%E4%B8%89%E4%BD%93'
# 应返回 {"books": [...]}，且响应头含 Access-Control-Allow-Origin: *
```
