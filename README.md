# wxread-panel

wxread 微信读书刷时长的 Web 控制面板，基于 GitHub Pages 部署，与 [rudofski/wxread](https://github.com/rudofski/wxread/) 仓库联动。

## 功能

- 📊 仪表盘 — 控制入口 URL、接口状态监控、最近运行记录
- ⚙️ 配置管理 — 仓库连接、curl_bash 登录、WxPusher 推送、阅读时长
- 📚 书城选书 — 搜索微信读书书城，选择刷时长书籍
- 📋 任务管理 — 立即运行、停止/删除历史
- 📅 运行日历 — 热力图展示，状态统计
- 🔄 自动对接 — wxread 变量名变更时自动兼容

## 部署

1. Fork 本仓库
2. 在 GitHub 注册 OAuth App（或使用 Personal Access Token）
3. Settings → Pages 启用，Source 选 `gh-pages` 分支 / (root)
4. 访问 `https://<你的用户名>.github.io/wxread-panel/`

## 书城搜索（线上部署）

`weread.qq.com` 搜索接口未开放 CORS，GitHub Pages 部署后浏览器会拦截书城搜索直连请求。

- **本地开发**：不配置任何变量，直连可用
- **线上部署**：在仓库 `Settings → Actions → Variables` 添加 `VITE_WEREAD_PROXY`（自建 Cloudflare Worker 地址，代码与部署说明见 `worker/`），重新部署后生效

## 登录方式

本项目为纯前端（GitHub Pages），无法安全完成 OAuth code → token 交换，**仅支持 Personal Access Token 登录**：

1. 在 [GitHub Settings → Tokens](https://github.com/settings/tokens) 创建 token，勾选 `repo` 和 `workflow` 权限
2. 打开面板 → 登录页 → 粘贴 token → 使用 Token 登录
3. Token 仅保存在浏览器 localStorage，退出登录即清除

## curl-helper 独立工具

面板内置 curl_bash 获取工具（书签小工具 / F12 教程 / 手动粘贴三种方式），
部署后访问 `/wxread-panel/curl-helper/` 或本地 `public/curl-helper/index.html` 即可使用。

## 本地开发

```bash
npm install
npm run dev                  # http://localhost:3000
```

无需任何环境变量（纯 PAT 登录，不依赖 OAuth Client ID；书城搜索本地直连）。

## 测试

```bash
npm run test:unit    # Vitest 单元测试
npm run test:e2e     # Playwright E2E（需 npx playwright install chromium）
npm run build        # 类型检查 + 生产构建
```