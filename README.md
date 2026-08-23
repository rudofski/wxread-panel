# wxread-panel

wxread 微信读书刷时长的 Web 控制面板，基于 GitHub Pages 部署，与 [rudofski/wxread](https://github.com/rudofski/wxread/) 仓库联动。

## 功能

- 📊 **仪表盘** — 控制入口 URL、接口状态监控、最近运行记录
- ⚙️ **配置管理** — 仓库连接、curl_bash 登录、推送方式、阅读时长
- 📋 **任务管理** — 立即运行、每日定时、停止/删除历史（自动刷新）
- 📅 **运行日历** — 热力图展示运行状态与成功率
- 🔄 **自动对接** — wxread 变量名变更时自动兼容（`READ_NUM` ↔ `READ_MINUTES`）

## 登录方式

本项目为纯前端（GitHub Pages），无法安全完成 OAuth code → token 交换，**仅支持 Personal Access Token 登录**：

1. 在 [GitHub Settings → Tokens](https://github.com/settings/tokens) 创建 token，勾选 `repo` 和 `workflow` 权限
2. 打开面板 → 登录页 → 粘贴 token → 使用 Token 登录
3. Token 仅保存在浏览器 localStorage，退出登录即清除

## 访问密码（可选）

设置后打开面板需先输入访问密码，24 小时内免重复输入（防共用设备场景）。

**线上启用（推荐）**：

1. 本地生成密码的 SHA-256 哈希（把「你的密码」换成实际密码）：
   ```bash
   node -e "const c=require('crypto');process.stdout.write(c.createHash('sha256').update('你的密码').digest('hex'))"
   ```
2. 仓库 `Settings → Secrets and variables → Actions → Secrets` 添加 `PANEL_PASSWORD_HASH` = 上一步输出的 64 位 hex
3. `git push origin master` 重新部署即启用（deploy.yml 构建时自动注入）

**本地开发**：在 `.env.local` 设置 `VITE_PANEL_PASSWORD_HASH=<64 位 hex>`。

> 安全说明：构建产物中仅含密码哈希、不含明文（Vite 会把 `VITE_` 变量内联进 JS，故注入的是哈希）；前端密码校验可被绕过，仅防共用设备，真正的防线仍是 PAT token。

## 获取 WXREAD_CURL_BASH（约 30 秒）

微信读书登录凭证 `WXREAD_CURL_BASH` 需从浏览器获取（cookies 无法跨站读取）。面板内置 curl-helper 工具，三种方式任选：

1. **书签小工具（推荐）**：打开微信读书网页版登录后，把 curl-helper 页面上的书签按钮拖到书签栏，在阅读页点击即可一键复制 curl_bash
2. **F12 教程**：Network 面板过滤 `read` 请求，右键 Copy as cURL (bash)
3. **手动粘贴**：在其他渠道获取后粘贴验证格式

配置页"登录方式"卡片内置该工具入口。部署后访问 `https://<owner>.github.io/wxread-panel/curl-helper/`。

## 部署

`git push` 即自动构建并发布到 GitHub Pages（`.github/workflows/deploy.yml`）。

```bash
git remote add origin https://github.com/<owner>/wxread-panel.git
git push -u origin master
# 或使用一键脚本：./deploy.sh
```

首次需在仓库 `Settings → Pages` 将 Source 设为 `gh-pages` 分支 / `(root)`。

## 本地开发

```bash
npm install
npm run dev   # http://localhost:3000
```

无需任何环境变量（访问密码等可选项见 `.env.example`）。

## 测试

```bash
npm run test:unit    # Vitest 单元测试
npm run test:e2e     # Playwright E2E（需 npx playwright install chromium）
npm run build        # 类型检查 + 生产构建
```

## 部署后检查

```bash
node verify-health.mjs                        # 线上健康检查（入口/登录/守卫/curl-helper，无需 token）
GITHUB_PAT=ghp_xxx node verify-save.mjs       # 线上保存配置回归（需真实 PAT，token 不进对话）
```
