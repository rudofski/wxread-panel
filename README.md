# wxread-panel

wxread 微信读书刷时长的 Web 控制面板，基于 GitHub Pages 部署，与 [rudofski/wxread](https://github.com/rudofski/wxread/) 仓库联动。

## 功能

- 📊 仪表盘 — 控制入口 URL、接口状态监控、最近运行记录
- ⚙️ 配置管理 — 仓库连接、curl_bash 登录、WxPusher 推送、阅读时长
- 📚 书城选书 — 搜索微信读书书城，选择刷时长书籍
- 📋 任务管理 — 立即运行、停止/删除历史
- 📅 运行日历 — 热力图展示，状态统计
- 🔄 自动对接 — wxread 变量名变更时自动兼容

## 部署（一键）

### 方式一：GitHub Actions 全自动（推荐）

首次配置一次，之后 `git push` 即自动完成：Worker 部署 → 代理变量注入 → 构建 → Pages 发布。

1. 创建仓库并推送：`git remote add origin https://github.com/<owner>/wxread-panel.git && git push -u origin master`
2. 开启 GitHub Pages：仓库 `Settings → Pages` → Source 选 `Deploy from a branch` → `gh-pages` / `(root)`
3. 配置 Cloudflare 凭据（仓库 `Settings → Secrets and variables → Actions → Secrets`）：
   - `CF_API_TOKEN`：Cloudflare 账号 API Token（权限：Workers Scripts Edit）
   - `CF_ACCOUNT_ID`：Cloudflare 账号 ID（dashboard 右下角）
   - `CF_WORKER_SUBDOMAIN`：workers.dev 子域（Workers 页面右上角，不含前缀）
4. 确保 Actions 工作流权限为读写：`Settings → Actions → General → Workflow permissions → Read and write permissions`
5. 之后每次 `git push origin master`，Actions 自动部署；也可在 Actions 页手动运行 `Deploy to GitHub Pages`

未配置 CF 凭据时 Worker 步骤自动跳过，面板其余功能正常，仅线上书城搜索需手动部署 Worker 并配置 `VITE_WEREAD_PROXY` 变量（见 `worker/README.md`）。

### 方式二：本地脚本

```bash
./deploy.sh            # 部署 Worker + 推送触发部署
./deploy.sh --skip-worker   # 只推送
```

访问 `https://<owner>.github.io/wxread-panel/`。

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