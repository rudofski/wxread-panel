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

## 本地开发

```bash
npm install
echo "VITE_GITHUB_CLIENT_ID=your_id" > .env.local
npm run dev
```