# wxread-panel

wxread 微信读书刷时长的 Web 控制面板，基于 GitHub Pages 部署，与 [rudofski/wxread](https://github.com/rudofski/wxread/) 仓库联动。

## 功能

- 📊 **仪表盘** — 控制入口 URL、接口状态监控、最近运行记录
- ⚙️ **配置管理** — 仓库连接、curl_bash 登录、推送方式、阅读时长
- 📋 **任务管理** — 立即运行、每日定时、停止/删除历史（自动刷新）
- 📅 **运行日历** — 热力图展示运行状态与成功率
- 🔄 **自动对接** — wxread 变量名变更时自动兼容（`READ_NUM` ↔ `READ_MINUTES`）
- 💾 **记忆存储 + wxread 回读** — 配置自动保存在浏览器（localStorage），重开面板自动恢复仓库地址并回读远程真实状态（README 变量与 Secrets 存在性），仪表盘不再误显"未配置"
- 🛡️ **Actions 守护** — 配置页实时显示「Actions 工作流正常 / 已停用」与「推送接口正常」；本仓库自带 `wxread-guard` 工作流，每天 04:45 预检、05:30 复查补跑、12:00 巡检告警

## Actions 守护（防止 wxread 定时任务被 GitHub 停用）

fork 出来的仓库长期无活动时，GitHub 会把它的 workflows 置为 `disabled_manually`，Actions 页面提示
`Workflows aren't being run on this forked repository`，定时任务从此静默失效。wxread 的 `keepalive-job`
只能防「60 天无活动」，防不住这种情况，所以要有一个外部守护——它必须放在 **panel 仓库**里，
放在 wxread 里会跟着被守护对象一起停用，等于没有。

`wxread-guard` 每天的职责（GitHub cron 是 UTC，下表已换算北京时间）：

| 时间 | 模式 | 做什么 |
| --- | --- | --- |
| 04:45 | `preflight` | wxread 05:00 定时前，若工作流 state 不是 `active` → `PUT .../enable`，2 秒后复核 |
| 05:30 | `all` | 过了 60 分钟宽限仍无运行 → `workflow_dispatch` 补跑；同时判一次告警 |
| 12:00 | `inspect` | 当天仍无成功运行 → 走 wxread 的四通道推送发出异常报告 |

去重状态存在本仓库的 Actions Variable `GUARD_STATE`（JSON），同一天不会重复补跑、重复告警。

### 一次配置（只需做一遍）

在 **wxread-panel** 仓库 → Settings → Secrets and variables → Actions：

1. **Secret** `WXREAD_GUARD_PAT`：细粒度 PAT，Repository access 选 `rudofski/wxread`，
   权限 `Actions: Read and write`（读工作流状态、enable、dispatch 都要它；`GITHUB_TOKEN` 跨仓库无效）。
2. **Secret** 推送通道，键名与 wxread 完全一致（任选其一）：
   `PUSH_METHOD` + 对应的 `WXPUSHER_SPT` / `PUSHPLUS_TOKEN` / `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` / `SERVERCHAN_SPT`。
3. **Variable**（可选，不配用默认值）：`WXREAD_REPO`=rudofski/wxread、`WXREAD_WORKFLOW`=deploy.yml、
   `WXREAD_REF`=main、`WXREAD_SCHEDULED_HOUR`=5、`WXREAD_GRACE_MIN`=60、`WXREAD_INSPECT_HOUR`=12。

配完到 Actions → wxread-guard → Run workflow，`mode` 选 `check` 验证凭证能读通（只读，不派发不推送）。

### 本地体检

```bash
WXREAD_GUARD_PAT=ghp_xxx node scripts/guard/main.mjs --mode check    # 只读：打印工作流状态与今日运行
WXREAD_GUARD_PAT=ghp_xxx node scripts/guard/main.mjs --mode all --dry-run  # 打印完整决策，不写状态
```

退出码：`0` 正常、`2` 需要人工介入（enable 未被接受、补跑失败）、`1` 运行出错。

## 登录方式

本项目为纯前端（GitHub Pages），无法安全完成 OAuth code → token 交换，**仅支持 Personal Access Token 登录**：

1. 在 [GitHub Settings → Tokens](https://github.com/settings/tokens) 创建 token，勾选 `repo` 和 `workflow` 权限
2. 打开面板 → 登录页 → 粘贴 token → 使用 Token 登录
3. Token 仅保存在浏览器 localStorage，退出登录即清除

## 访问密码（可选）

设置后打开面板需先输入访问密码，24 小时内免重复输入（防共用设备场景）。

**线上启用（推荐）**：

1. 本地生成密码的 SHA-256 哈希（密码输入时不显示、不落盘）：
   ```bash
   node scripts/password-hash.mjs
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
