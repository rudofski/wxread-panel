# wxread-panel 扩展辅助工程设计文档

> 版本：v0.1.8  \
> 日期：2026-08-23  \
> 对应提交：`4fd2305`  \
> 关联仓库：[rudofski/wxread](https://github.com/rudofski/wxread/)  \
> v0.1.1 变更：移除书城搜索与 Cloudflare Worker 代理；认证改为纯 PAT；热力图改自绘实现  \
> v0.1.2 变更：Secrets 加密根因修复（tweetnacl 随机 nonce → libsodium `crypto_box_seal`）；新增可选密码门；线上保存配置验证通过（422 错误消失）  \
> v0.1.3 变更：**记忆存储 + wxread 回读**（配置持久化 localStorage，打开面板自动连接回读远程状态）；密码门哈希化（`VITE_PANEL_PASSWORD` → `VITE_PANEL_PASSWORD_HASH`，修复明文内联缺陷）；curl_bash 保存根因修复 + 仪表盘远程 Secrets 存在性检测；新增密码哈希脚本与线上健康检查脚本  \
> v0.1.4 变更：**UI 布局重构**——内容区全宽（保留侧边栏）；仪表盘移除控制入口卡片、最近运行改横向日期轴、立即运行直接触发；删除任务管理页（定时任务并入配置页）；配置 5 模块网格平铺；运行日历改横向 GitHub 贡献图风格  \
> v0.1.5 变更：**书签小工具根因修复**——hook fetch/XHR 捕获真实阅读上报请求（补齐 `x-wrpa-0` 签名头、`--data-raw` 请求体与 content-type，旧版仅抓 document.cookie 导致提取的 curl 无法上报）；新增 `scripts/build-bookmarklet.mjs`（esbuild 压缩同步）与 `src/utils/curlBuilder.ts`（TDD，后续扩展至 11 测试）；**UI 微调**——仪表盘改"运行状态"、运行记录只留红绿圆点+阅读时长并铺满、日历每日标记改用最新记录并去"少-多"图例、配置页保存按钮移右上角、"登录方式"改名"微信读书接口"、curl_bash 引导拆为独立模块置于定时任务后  \
> v0.1.6 变更：**运行日历重写**——每月独立网格（1 号居首格、顺序填充、绝不跨月，替代按周切列导致的串月）；CSS Grid 按总列数均分容器宽度，格子统一大小铺满显示区域；状态语义"最新运行非失败即绿"（含 cancelled/skipped 等）；新增 `src/utils/calendarGrid.ts` 纯函数（TDD 6 测试），测试计数 50 → **61**  \
> v0.1.7 变更：**状态四档统一 + 本地时区归组 + 版本同步机制**——新增 `classifyRun` 统一分类（success=绿 / failure=红 / running=蓝 / idle=灰），运行状态圆点与运行日历格子共用同一判定，两处状态完全同步（含日历新增蓝/灰格子与图例）；日历 dayMap/详情改用本地时区 `localDateKey`（与最近运行同源）；最近运行横轴按本地时区归组（修复凌晨运行串日）并按窗口宽度响应天数；版本号三处同步机制（`scripts/bump-version.mjs` 一键升级 package.json/lock/deploy.sh），测试计数 61 → **73**  \
> v0.1.8 变更：**Chrome 扩展取代书签 + 日历成功优先**——新增 `chrome-extension/` MV3 扩展：`chrome.cookies` API 读取 **HttpOnly cookie**（wr_vid/wr_skey/wr_rt，书签/页面 JS 永远拿不到）+ MAIN world content script 捕获 x-wrpa-0 签名头与请求体 → 生成与 F12 完全一致的完整 curl（取代书签成为 curl-helper 方式一）；curl-helper 重构移除书签区块，F12/手动保留；日历每日状态改为**成功优先**（当日任一成功即绿，无成功取最新，`pickDayStatus` TDD 5 测试）并移除图例；测试计数 73 → **78**

---

## 一、项目概述

### 1.1 定位

`wxread-panel` 是一个基于 **GitHub Pages** 部署的纯前端 Web 控制面板，与 `rudofski/wxread` 仓库联动，通过 GitHub API 实现配置管理、任务触发和运行状态监控。

### 1.2 核心决策总览

| # | 决策点 | 选择 |
|---|--------|------|
| 1 | 部署架构 | **GitHub Pages 纯静态 SPA** |
| 2 | 登录凭证获取 | **Chrome 扩展（v0.1.8 起，`chrome-extension/`）+ F12 备用 + 手动粘贴**（`/curl-helper/` 图文引导）；扩展 = content script（MAIN world hook fetch/XHR 捕获 x-wrpa-0 与请求体）+ `chrome.cookies` API 读 **HttpOnly cookie**（wr_vid/wr_skey/wr_rt——书签/页面 JS 永远拿不到），生成与 F12 完全一致的完整 curl。书签小工具因无法读 HttpOnly 已停用（源码保留仓库） |
| 3 | 认证方式 | **Personal Access Token（纯 PAT）**——GitHub Pages 纯前端无法安全完成 OAuth code 交换 |
| 4 | 刷时长执行 | **触发 GitHub Actions**（`workflow_dispatch`） |
| 5 | 日历图表 | **自绘热力图**（轻量 CSS grid，替代 Cal-Heatmap 依赖）；v0.1.6 改为**每月独立网格**：1 号居首格、顺序填充不跨月；CSS Grid 按总列数均分铺满；v0.1.7 状态**四档统一**（success=绿 / failure=红 / running=蓝脉冲 / idle=灰）；v0.1.8 每日**成功优先**（当日任一成功即绿，无成功取最新）并移除图例 |
| 6 | 项目接口 | **输入仓库地址，通过 GitHub API 读写 Secrets/Variables** |
| 7 | 推送配置 | **面板配置 → GitHub Secrets → Actions 运行时推送** |
| 8 | 技术栈 | **Vue 3 + Vite + TypeScript + Octokit + libsodium-wrappers** |
| 9 | 书城搜索 | **已移除**（v0.1.0 曾引入；weread 搜索接口无 CORS 头，GitHub Pages 线上不可用，公共代理在国内不可达，故 v0.1.1 下线） |
| 10 | 访问密码 | **可选密码门**（构建变量 `VITE_PANEL_PASSWORD_HASH`=密码的 SHA-256 hex；v0.1.3 由明文 `VITE_PANEL_PASSWORD` 改为哈希，修复 Vite 内联明文缺陷；24h 解锁；防共用设备场景） |
| 11 | 记忆存储与回读 | **配置持久化 localStorage + 打开面板自动连接回读远程真实状态**（v0.1.3）——刷新/重开不丢配置，仪表盘显示真实远程状态而非"未配置" |
| 12 | 运行状态语义 | **单一事实来源 `classifyRun`**（v0.1.7）——运行状态圆点与运行日历格子共用同一四档分类（running/success/failure/idle），杜绝两处状态漂移；日期归组统一本地时区 `localDateKey` |
| 13 | 版本号管理 | **`package.json` 单一事实来源 + `scripts/bump-version.mjs` 一键三处同步**（v0.1.7）——界面从 package.json 读取；bump 脚本同步 package.json / package-lock.json / deploy.sh 标签，杜绝版本号漂移复发 |
| 14 | HttpOnly 凭证获取 | **Chrome 扩展 `chrome.cookies` API**（v0.1.8）——微信读书把 wr_vid/wr_skey/wr_rt 设为 HttpOnly，页面 JS 与书签均无法读取（硬限制）；扩展的 cookies API 可读全部 cookie（官方文档 + 社区实证），是本项目解决 curl_bash 登录凭证缺口的最终方案 |

---

## 二、系统架构

### 2.1 整体拓扑

```
┌──────────────────────────────────────────────────────┐
│              GitHub Pages (gh-pages 分支)              │
│  ┌────────────────────────────────────────────────┐  │
│  │          Vue 3 SPA 控制面板                      │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐                    │  │
│  │  │运行状态│ │配置参数│ │运行日历│                    │  │
│  │  └──────┘ └──────┘ └──────┘                    │  │
│  │  └── curl-helper/ 独立工具（Chrome 扩展/F12/手动）│  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │ PAT Token + 配置（localStorage）│
└─────────────────────────┼────────────────────────────┘
                          │ REST API / Octokit
┌─────────────────────────┼────────────────────────────┐
│              GitHub API (api.github.com)              │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Secrets/     │  │ Actions   │  │ Workflow     │  │
│  │ Variables    │  │ Logs      │  │ Dispatch     │  │
│  └──────────────┘  └───────────┘  └──────────────┘  │
└─────────────────────────────┬────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────┐
│     rudofski/wxread 仓库     │                        │
│  ┌──────────┐  ┌──────────────────────────────────┐  │
│  │ Actions  │─▶│ 刷时长 → 微信读书 API → 推送     │  │
│  │ Workflow │  │ (main.py + push.py)               │  │
│  └──────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.2 设计原则

- **纯前端遥控器**：面板不直接执行刷时长，所有实际操作由 GitHub Actions 完成
- **单向控制流**：面板 → GitHub API → Actions → 微信读书
- **隔离部署**：独立仓库 `wxread-panel`，不混入 wxread
- **零后端依赖**：无 OAuth 代理、无 Worker、无任何服务端（v0.1.1 起）
- **记忆优先**：配置本地持久化，打开面板自动回读远程状态，减少重复操作（v0.1.3）
- **状态单一来源**：运行状态分类统一走 `classifyRun`、日期归组统一本地时区（v0.1.7）——任何展示层（圆点/日历/详情）不各自实现判定逻辑，从源头杜绝状态漂移

---

## 三、技术栈

| 类别 | 选型 | 原因 |
|------|------|------|
| 框架 | Vue 3 + Composition API | 组件化，适合多模块面板 |
| 构建 | Vite | 快速 HMR，生产构建体积小 |
| 语言 | TypeScript | 类型安全，适合 API 对接 |
| 路由 | Vue Router 4（hash 模式） | SPA 页面切换，GitHub Pages 无需重写规则 |
| 状态管理 | Pinia | 轻量，TypeScript 友好 |
| 本地存储 | localStorage | 配置记忆（`wxread_panel_settings`）、token、解锁态；零依赖 |
| GitHub API | @octokit/rest | 官方 SDK，覆盖全部 API |
| Secrets 加密 | libsodium-wrappers | GitHub 官方库的 `crypto_box_seal`（v0.1.2 从 tweetnacl 迁移，修复随机 nonce 导致的线上 422） |
| 访问密码 | Web Crypto（SHA-256） | 无额外依赖；构建产物仅含哈希、不含明文（v0.1.3 修复 Vite 内联明文缺陷） |
| HTTP | 原生 fetch | 仅日志拉取一处使用，无需 axios |
| 测试 | Vitest + Playwright | 单测（纯函数/mock 交互/store）+ E2E 冒烟 |
| 部署 | GitHub Actions（deploy → gh-pages） | push 即自动构建发布 |

---

## 四、项目结构

```
wxread-panel/
├── .github/workflows/
│   └── deploy.yml               # 构建（注入 PANEL_PASSWORD_HASH）+ 单测 + 发布到 gh-pages
├── chrome-extension/           # Chrome 扩展（v0.1.8 取代书签；cookies API 读 HttpOnly）
│   ├── manifest.json            #   MV3：cookies+storage+clipboardWrite，host 仅 weread.qq.com
│   ├── content-main.js          #   页面主世界（MAIN）：hook fetch/XHR 捕获 x-wrpa-0 + 请求体
│   ├── content-bridge.js        #   桥接：转发捕获消息给 service worker
│   ├── background.js            #   cookies.getAll 读 HttpOnly + 合并生成完整 curl + 存 storage
│   ├── popup.html / popup.js    #   弹窗：展示 + 复制 curl_bash
│   └── README.md                #   安装（开发者模式加载）/使用/权限说明
├── public/
│   ├── favicon.svg
│   └── curl-helper/             # 独立 curl_bash 获取工具
│       ├── index.html           #   三选一获取方式（Chrome 扩展/F12/手动粘贴；书签已移除）
│       ├── bookmarklet.js       #   书签小工具源码（v0.1.8 起停用，代码保留供历史参考）
│       └── bookmarklet.min.js   #   书签压缩产物（build-bookmarklet.mjs 输出，不再内嵌页面）
├── scripts/
│   ├── password-hash.mjs        # 生成密码门哈希（静默输入/环境变量，防泄漏）
│   ├── build-bookmarklet.mjs    # esbuild 压缩 bookmarklet → 输出独立 min 文件（v0.1.8 起不再改 index.html）
│   └── bump-version.mjs         # 一键升级版本号（package.json/lock/deploy.sh 三处同步，v0.1.7）
├── src/
│   ├── main.ts                  # 入口
│   ├── App.vue                  # 根组件：锁屏/侧边栏/路由视图 + 挂载时自动回读远程状态
│   ├── router.ts                # 路由定义 + 登录态守卫
│   ├── api/
│   │   └── github.ts            # Octokit 封装 + 适配层 + sealed box 加密 + secretExists 存在性检测
│   ├── stores/
│   │   ├── auth.ts              # PAT 登录态（Pinia，localStorage 持久化）
│   │   └── settings.ts          # 配置状态 + localStorage 持久化（记忆存储）+ 远程 Secrets 状态
│   ├── utils/
│   │   ├── schedule.ts          # 定时任务设置（localStorage）
│   │   ├── sealedBox.ts         # libsodium 密封盒加密（crypto_box_seal）
│   │   ├── panelLock.ts         # 可选密码门（哈希校验 + 24h 解锁态）
│   │   ├── curlBuilder.ts       # 捕获请求 → 完整 curl 命令（书签/扩展内联版的可测试参照，v0.1.5）
│   │   ├── calendarGrid.ts      # 运行日历网格纯函数（每月独立网格、1 号居首格，v0.1.6）
│   │   ├── runStatus.ts         # 运行状态统一分类（success/failure/running/idle）+ 成功优先选择（v0.1.7/0.1.8）
│   │   └── runGrouping.ts       # 最近运行按本地时区归组 + 响应式天数（v0.1.7）
│   ├── components/
│   │   ├── LockScreen.vue       # 密码门解锁界面（可选）
│   │   ├── Sidebar.vue
│   │   └── config/
│   │       ├── RepoInput.vue    # 仓库地址输入 + 自动检测
│   │       ├── LoginConfig.vue  # 微信读书接口（curl_bash 输入，watch 同步 store）
│   │       ├── PushConfig.vue   # 推送方式 + 各平台 token
│   │       ├── ReadConfig.vue   # 阅读时长（分钟 ↔ 次数）
│   │       ├── ScheduleCard.vue # 定时任务设置（v0.1.4 从任务页并入配置页）
│   │       └── CurlHelperCard.vue # 一键获取 curl_bash 引导（v0.1.5 从 LoginConfig 拆出，置定时任务后）
│   └── views/
│       ├── Dashboard.vue        # 运行状态（状态面板 + 横向最近运行：圆点+阅读时长 + 立即运行直接触发）
│       ├── Config.vue           # 配置参数页（6 模块网格平铺，保存按钮右上角）
│       └── Calendar.vue         # 运行日历（每月独立网格：1 号居首格、CSS Grid 均分铺满，v0.1.6）
├── tests/
│   ├── api/github.test.ts       # 纯函数（URL/错误解析）6
│   ├── api/github-api.test.ts   # mock Octokit 交互测试（含 secretExists）10
│   ├── stores/auth.test.ts      # 登录态 5
│   ├── stores/settings.test.ts  # 配置状态 + 持久化 roundtrip 7
│   ├── utils/schedule.test.ts   # 定时设置 6
│   ├── utils/sealedBox.test.ts  # 密封盒与 libsodium 互操作（模拟 GitHub 服务器）4
│   ├── utils/panelLock.test.ts  # 密码门（启用/校验/解锁态）6
│   ├── utils/curlBuilder.test.ts# curl 构建（headers/cookie/body/转义/URL 补全/浏览器头）11（v0.1.5）
│   ├── utils/calendarGrid.test.ts# 日历网格（1 号居首格/不跨月/列数/状态/未来）6（v0.1.6）
│   ├── utils/runGrouping.test.ts# 本地时区归组/响应式天数/跨天边界 7（v0.1.7）
│   ├── utils/runStatus.test.ts  # 状态四档分类 + 成功优先选择 10（v0.1.7/0.1.8）
│   └── e2e/smoke.spec.ts        # Playwright 冒烟 4
├── index.html
├── deploy.sh                    # 一键推送脚本
├── verify-health.mjs            # 线上健康检查（入口/登录/守卫/curl-helper，免 token）
├── verify-save.mjs              # 线上保存配置回归验证（读环境变量/.env.local）
└── README.md
```

---

## 五、核心数据流

### 5.1 认证（纯 PAT + 可选密码门）

```
打开面板
  → 若配置 VITE_PANEL_PASSWORD_HASH：先显示锁屏，输入密码哈希校验通过后解锁（24h 免重复）
  → 登录页输入 Personal Access Token
  → 存入 localStorage（github_token）→ 初始化 Octokit → 进入仪表盘
退出登录 → 清除 token + 重置 Octokit 单例
```

- 纯前端无法安全完成 OAuth code → token 交换（需要 client_secret 服务端代理），故仅支持 PAT
- token 需 `repo` + `workflow` 权限
- 密码门为可选第一道门（防共用设备）；前端校验可被绕过，真正防线仍是 PAT token
- **v0.1.3 哈希化**：Vite 会把 `VITE_` 前缀变量静态内联进 JS 产物，原 `VITE_PANEL_PASSWORD` 会泄露明文密码；改为注入 `VITE_PANEL_PASSWORD_HASH`（SHA-256 hex），产物仅含哈希（已实证 grep 验证）

### 5.2 布局与信息架构（v0.1.4，v0.1.5 微调）

- **全宽内容区**：保留左侧固定导航（仪表盘/配置参数/运行日历），各页面移除 `max-width` 限制，内容撑满剩余宽度
- **仪表盘（v0.1.5 改名"运行状态"）**：移除"控制入口"卡片；最近运行以**日期为横轴**（左早右近），每日一列、列内竖向排列该日多条记录，列容器 `flex:1` 横向铺满；每条记录**只显示圆点状态图标**（绿=成功/红=失败/蓝脉冲=运行中/灰=取消·跳过·超时）+ 时间 + **阅读时长**（运行耗时 updated_at − run_started_at），不显示项目名与状态文字
- **日期归组与响应式（v0.1.7）**：日期 key 与时间显示**同源（本地时区）**，修复凌晨运行（UTC 深夜 = 本地次日凌晨）被归到前一天的问题；横轴天数随窗口宽度响应（<900px 取 7 天 / <1280px 取 10 天 / 其余 14 天），窄屏时列 `min-width` + 横向滚动，最新日期永不截断
- **配置页（v0.1.5）**：6 模块网格平铺（项目接口/微信读书接口/推送接口/阅读设置/定时任务/一键获取 curl_bash）；保存按钮移至**页面右上角**（与标题同行）；卡片 padding/间距收紧使全部模块一屏可见
- **任务管理移除**：Tasks 页/路由/导航删除，定时任务并入配置页（ScheduleCard）

### 5.3 记忆存储 + wxread 回读（v0.1.3）

```
打开面板（App.vue onMounted）
  → 未登录：停留在登录页，不触发回读
  → 已登录 + 记忆了仓库地址（localStorage wxread_panel_settings）：
      → 自动 connectRepo(记忆地址)
          → 检测仓库连接
          → 回读 README 变量（READ_MINUTES/READ_NUM、PUSH_METHOD）
          → 检测关键 Secrets 存在性（WXREAD_CURL_BASH / WXPUSHER_SPT / ...）
      → 仪表盘显示真实远程状态（"已配置（远程 Secrets）" / "未配置，请到配置页..."）
```

- **记忆存储**：settings store 的仓库地址、阅读时长、推送方式、curl_bash、各推送 token 自动持久化（`watch` 深度监听变更即写 localStorage，无需手动保存）；损坏数据安全回退默认值
- **回读**：连接成功后 `wxreadAdapter.fromGitHub` 回读 Variables 覆盖本地值，`refreshSecretStatus` 检测 Secrets 存在性
- 安全边界：curl_bash / 推送 token 与 PAT 同存 localStorage（同一安全模型，XSS 风险文档化）；GitHub Secrets 的**值**不可读（API 限制），只能检测存在性

### 5.4 配置读写

```
Config.vue
  READ_NUM: 60 分钟 → 内部转换 120 次
  PUSH_METHOD: wxpusher
  WXPUSHER_SPT / WXREAD_CURL_BASH / PUSHPLUS_TOKEN / TELEGRAM_* / SERVERCHAN_SPT

保存时：
  → updateVariable（READ_NUM / READ_MINUTES / PUSH_METHOD）
  → updateSecret（各推送 token + curl_bash，libsodium sealed box 加密）
  → refreshSecretStatus（回读存在性）

读取时：
  → Variables 可读：READ_MINUTES/READ_NUM（新名优先）、PUSH_METHOD
  → Secrets 不可读值：面板以 secretExists 检测存在性（v0.1.3 起）
```

### 5.5 Secrets 加密（v0.1.2 根因修复记录）

GitHub Secrets API 要求 libsodium `crypto_box_seal`（curve25519 sealed box）：

```
GET /repos/{owner}/{repo}/actions/secrets/public-key
  → sodium.crypto_box_seal(secret, 公钥)   # nonce 由 libsodium 内部派生
  → base64 提交 PUT /repos/.../secrets/{name}
```

**历史根因**：v0.1.1 曾用 tweetnacl 以**随机 nonce** 手动拼装密封盒，而 libsodium 的 nonce 由 `blake2b(临时公钥 || 接收方公钥)` 派生，GitHub 服务器解封失败，报 `improperly encrypted secret`（422）。旧测试用 tweetnacl 自解封（接受任意 nonce）掩盖了问题。v0.1.2 改用 libsodium-wrappers，测试改为**与 libsodium 互操作验证**（模拟 GitHub 服务器解封），并显式使用 ORIGINAL base64 变体。线上实测（真实 PAT 保存配置）422 已消失。

### 5.6 触发运行

```
仪表盘"立即运行"（v0.1.4 起直接触发，不再跳转任务页）
  → dispatchWorkflow({ owner, repo, workflow_id, ref })
  → GitHub Actions 启动
  → 内联反馈（触发成功/失败）+ 3s 后刷新最近运行
```

支持：立即运行（仪表盘快捷操作）、每日定时（配置页 ScheduleCard，面板记录偏好，实际 cron 在 wxread 仓库）。停止/删除运行随任务管理页移除（v0.1.4）。

### 5.7 curl_bash 获取（v0.1.8 起：Chrome 扩展为主）

微信读书登录凭证 `WXREAD_CURL_BASH` 无法跨站读取（cookies 隔离），通过 `/curl-helper/` 工具获取：

```
方式一（推荐）：Chrome 扩展 —— 阅读页翻一页 → 自动捕获（含 HttpOnly 凭证）→ 一键复制
方式二：F12 → Network → 过滤 read → Copy as cURL (bash)（可靠备用）
方式三：手动粘贴并验证格式

配置页"微信读书接口"旁置"一键获取 curl_bash"独立模块（大按钮 + 三步引导）
```

**Chrome 扩展原理（v0.1.8）**：书签小工具的硬限制是微信读书把 `wr_vid`/`wr_skey`/`wr_rt` 设为 **HttpOnly cookie**——浏览器禁止任何网页脚本（含书签）读取，导致书签生成的 curl 缺登录凭证、`main.py` 启动刷新 wr_skey 必然失败。**Chrome 扩展可突破此边界**：

```
chrome-extension/（MV3，host 仅 weread.qq.com）
  ├─ content-main.js（MAIN world）：hook fetch/XHR 捕获 /web/book/read 的
  │    x-wrpa-0 签名头 + 请求体 + 页面可见头 → postMessage
  ├─ content-bridge.js（isolated）：转发捕获消息
  └─ background.js（service worker）：
       chrome.cookies.getAll({ domain: 'weread.qq.com' })  ← 含全部 HttpOnly cookie
       → 与捕获头合并（cookie 以 cookies API 为准）
       → buildCurl 生成与 F12 完全一致的完整 curl → chrome.storage
  └─ popup：展示捕获状态（含"已读到 wr_skey 等 HttpOnly 凭证"）+ 一键复制
```

- 关键能力：`chrome.cookies` API 可读取 cookie 存储中的**全部 cookie，包括 HttpOnly**（官方文档 + 社区实证）——这是书签（页面 JS）永远做不到的
- 构建逻辑与 `src/utils/curlBuilder.ts`（TDD 11 测试）等价，扩展内联自包含实现
- 安装：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序（选择 `chrome-extension/` 文件夹）
- **书签停用（v0.1.8）**：源码 `public/curl-helper/bookmarklet.js` 与压缩产物保留仓库供历史参考，curl-helper 页面不再提供（浏览器安全限制无法绕过的记录）

### 5.8 运行日历（每月独立网格，v0.1.6 重写；四档统一 v0.1.7；成功优先 v0.1.8）

```
Calendar.vue 加载
  → listWorkflowRuns({ per_page: 365 })
  → dayMap：按本地时区 localDateKey 归日收集**当日全部**运行记录
      → pickDayStatus（v0.1.8）：当日**只要有任意一条成功即显示成功**；无任何成功才取时间最新一条
      → classifyRun(选中记录)：success → 绿 / failure → 红 / running → 蓝脉冲 / idle(取消·跳过·超时) → 灰
      （v0.1.7：与运行状态圆点同一判定函数，两处完全同步）
  → buildMonthBlocks(year, dayMap, now) 纯函数生成 12 个月独立网格：
      每月从 1 号开始顺序填充、每列 7 格、列满换列、月底不满补 blank 空格子
      → 1 号永远在该月第一个格子，日期绝不跨月（替代 v0.1.4 按周切列导致的串月）
  → CSS Grid 渲染：外层 grid-template-columns: repeat(总列数, 1fr) 均分容器宽度
      → 所有格子统一大小、随窗口缩放，整个日历铺满显示区域
      月份块间以分隔线 + 留白区分；月份标签置于块顶
  → 点击格子 → 当日运行详情（与 dayMap 同一"成功优先"选择）；失败日期异步拉取 job 纯文本日志 → parseRunError 提取中文原因
  → 统计：成功 / 失败 / 成功率
```

- **布局语义**（v0.1.6）：不按万年历的星期对齐，每月 1 号固定位于该月第一个格子，纯顺序填充；每列 7 格（列 = 周概念，但不对应星期几），12 个月块横排，总列数（2026 年为 59）由 `--total-cols` CSS 变量传入 Grid
- **状态语义**（v0.1.6）：格子颜色只取决于**当日最新一条**运行，避免"当日最早一条"或 conclusion=null 记录回退导致的误判
- **状态同步**（v0.1.7）：状态判定收敛到 `classifyRun`（success=绿 / failure=红 / running=蓝脉冲 / idle=灰）——与运行状态圆点共用同一函数；图例同步 5 项（无记录/成功/失败/运行中/已取消）。历史语义"非失败即绿"（v0.1.6）把 cancelled/skipped/timed_out 也显示为绿，与 Dashboard 灰点不一致，v0.1.7 修正为四档
- **成功优先**（v0.1.8）：`pickDayStatus` 选择当日任意一条成功（优先于"最后一条"），无成功才取最新——例如某天先失败后成功、或先成功后失败，格子都显示成功（绿）；图例标注移除（`runStatus.ts` TDD 10 测试，含 5 个 pickDayStatus）
- 网格生成逻辑沉淀为 `src/utils/calendarGrid.ts`（纯函数，TDD 6 测试）；状态分类与成功优先 `src/utils/runStatus.ts`（TDD 10 测试）；日期归组 `src/utils/runGrouping.ts`（TDD 7 测试）

---

## 六、错误处理与状态监控

### 6.1 状态面板（仪表盘）

| 接口 | 检测方式 | 说明 |
|------|---------|------|
| 项目接口 | `GET /repos/{owner}/{repo}` | 连接后显示 full_name；404/403 分类提示 |
| 微信读书 | **Secrets 存在性检测（v0.1.3）** | `secretExists('WXREAD_CURL_BASH')` → 已配置（远程）；否则回退会话输入态 → "未配置，请到配置页获取并保存" |
| 推送接口 | **Secrets 存在性检测（v0.1.3）** | `secretExists('WXPUSHER_SPT' 等)` → 已配置（远程）；否则回退会话输入态 |

- Secrets 的**值**仍不可读（GitHub API 限制），但存在性可通过元数据 API 检测
- 状态为双维度：远程存在性（权威）→ 会话输入态（已填未保存）→ 未配置
- 打开面板自动回读（5.2），不再误显"未配置"

### 6.2 Actions 失败处理

```
Run 失败
  → listJobsForWorkflowRun 取首个 job
  → 原生 fetch job logs（纯文本，非 run 级 zip）
  → parseRunError 正则匹配 → 中文提示（Cookie 过期/推送失败/超时/限流/未配置）
  → 热力图红格 + 日期详情显示原因
```

### 6.3 前端异常分级

| 层次 | 场景 | 处理 |
|------|------|------|
| 网络 | API 超时/限流 | 捕获提示 |
| 认证 | Token 失效/权限不足 | 手动重新登录 |
| 业务 | 未连接仓库 | 运行按钮置灰 + 提示 |
| 业务 | 任务已在运行 | 运行按钮置灰 |
| 存储 | localStorage 数据损坏 | 回退默认值（记忆存储安全降级） |

---

## 七、wxread 升级自动对接

### 7.1 适配层设计

所有 GitHub Variables/Secrets 读写通过 `api/github.ts` 的统一适配层 `wxreadAdapter`：

```typescript
const wxreadAdapter = {
  fromGitHub(): PanelSettings {
    // READ_MINUTES 优先（新格式，直接分钟），否则 READ_NUM ÷ 2
  },
  toGitHub(settings): void {
    // 分钟 → 次数：readMinutes * 2，同时写 READ_MINUTES（兼容）
  },
  pushSecrets(): void {
    // 各推送 token + curl_bash → sealed box 加密写入 Secrets
  }
};
```

### 7.2 兼容机制

| 机制 | 状态 |
|------|------|
| 变量映射 fallback（READ_NUM ↔ READ_MINUTES，新名优先） | ✅ 已实现 |
| workflow 自动发现（listRepoWorkflows） | ✅ 已实现 |
| 版本探测 / 自诊断 banner（检测到升级时提示） | ⏳ 未实现（v0.1.0 设计项，实施计划外） |

---

## 八、独立本地扫码工具（curl-helper）

- 部署在面板同域下（`/curl-helper/`），静态 HTML，双击可用
- 提供三种获取 `WXREAD_CURL_BASH` 方式（**Chrome 扩展** / F12 教程 / 手动粘贴）
- **Chrome 扩展（v0.1.8 起方式一）**：阅读页翻一页即自动捕获，`chrome.cookies` API 读取 HttpOnly 凭证（wr_vid/wr_skey/wr_rt），生成与 F12 完全一致的完整 curl 并一键复制（详见 5.7）；页面含 6 步安装引导（下载 chrome-extension → 开发者模式加载）
- 书签小工具（v0.1.5）因无法读取 HttpOnly cookie 已停用（v0.1.8），源码保留仓库；F12 保留为可靠备用
- 配置页"一键获取 curl_bash"独立模块（v0.1.5，位于定时任务后）提供醒目入口（自动适配 base 路径）

---

## 九、测试策略

### 9.1 测试分层（实际）

| 层 | 范围 | 工具 | 数量 |
|----|------|------|------|
| 纯函数单测 | URL/错误解析（6）+ 定时设置（6）+ curl 构建（11）+ 日历网格（6）+ 本地时区归组（7）+ 状态分类/成功优先（10） | Vitest | 46 |
| Mock API 交互 | detectRepo / variable / dispatch / 适配层 / 日志拉取 / secretExists | Vitest + vi.mock | 10 |
| Store 测试 | auth 登录态（5）、settings 配置状态 + 持久化 roundtrip（7） | Vitest + Pinia | 12 |
| 加密测试 | sealed box 与 libsodium 互操作（模拟 GitHub 服务器） | Vitest | 4 |
| 密码门测试 | 启用/禁用、哈希校验、24h 解锁态 | Vitest | 6 |
| E2E 冒烟 | 登录跳转 / token 输入 / 无 OAuth 按钮 | Playwright | 4 |

合计 **78** 个单元测试 + 4 个 E2E（v0.1.5 起 curl 构建扩展至 11：含 resolveUrl 相对 URL 补全、browserHeaders 浏览器自动头；v0.1.6 新增日历网格 6 个；v0.1.7 新增本地时区归组 7 个 + 状态分类 5 个；v0.1.8 新增成功优先选择 5 个）。组件层未单独引入测试框架（`@vue/test-utils` 未使用），组件行为由 E2E 冒烟覆盖。

### 9.2 关键测试用例

- 适配层：新旧变量名兼容、分钟↔次数转换、默认值回退
- 错误解析：Cookie 过期、推送失败、网络超时 → 对应中文提示
- 加密：**libsodium 能解封我们的密文**（GitHub 服务器等效）、非 ASCII 内容往返、密文随机性
- **curl 构建（v0.1.5）**：headers 归一化与无效头过滤、cookie 兜底、content-type/origin/referer/user-agent 自动补齐、含引号/中文值转义、body 追加 `--data-raw`、resolveUrl 相对 URL 补全、browserHeaders 浏览器自动头（sec-ch-ua/sec-fetch-* 等）
- **日历网格（v0.1.6）**：每月 1 号位于该月第一个格子、所有格子不跨月（空格子标记 blank）、2 月 28 天列数与补空正确、状态映射、未来/过去标记、总列数 59
- **本地时区归组（v0.1.7）**：日期 key 与本地时区格式化一致（与 formatTime 同源）、UTC 深夜运行归入本地次日（跨天边界）、横轴左早右近、组内显式按时间正序（不依赖 API 顺序）、空日占位、run_started_at 优先、响应式天数阈值（7/10/14）
- **状态分类（v0.1.7）**：in_progress → running（优先于结论）、success/failure 映射、cancelled/skipped/timed_out/neutral/null → idle（灰）
- **成功优先选择（v0.1.8）**：当日有成功 → 返回成功（即使最后一条失败）；无成功 → 返回时间最新一条；运行中最新的无成功场景；空数组 → null；不依赖输入顺序
- 密码门：未配置不启用、正确/错误密码、未启用放行、24h 过期
- **持久化（v0.1.3）**：修改字段 → 重新创建 store 恢复（记忆存储 roundtrip）；无数据用默认值；损坏 JSON 安全回退
- E2E：未登录跳转登录页、PAT 输入框、无 OAuth 按钮、创建 Token 引导链接

---

## 十、部署方案

### 10.1 一键部署

`push master` 触发 `.github/workflows/deploy.yml`：

```
checkout → setup-node(20) → npm ci → npm run build（vue-tsc + vite，注入 PANEL_PASSWORD_HASH Secret）
  → npm run test:unit → peaceiris/actions-gh-pages 发布 gh-pages
```

- `VITE_PANEL_PASSWORD_HASH` 从 Actions Secret `PANEL_PASSWORD_HASH` 注入；未配置则为空 → 密码门关闭（不影响使用）
- 首次配置：创建仓库 → push → `Settings → Pages` Source 选 `gh-pages` / `(root)`
- 本地一键脚本 `./deploy.sh`：推送 master + 标签

### 10.2 线上验证（实测通过，2026-08-23）

| 检查项 | 状态 |
|--------|------|
| 入口 URL（200 + SPA 渲染） | ✅ |
| 登录页（PAT 输入、无 OAuth 按钮、创建 Token 链接） | ✅ |
| 配置页路由守卫（未登录重定向登录页） | ✅ |
| curl-helper 页面（200 + 标题） | ✅ |
| favicon / JS bundle（200） | ✅ |
| **保存配置（真实 PAT 实测）** | ✅ 成功，422 加密错误消失（占位 curl_bash 验证加密链路） |
| **v0.1.5 新 UI（线上 chunk 实测）** | ✅ 运行状态/最近运行/run-dot、配置参数/微信读书接口/一键获取 curl_bash 独立模块、日历"少-多"已移除（出现 0 次）、has() 最新记录逻辑在线 |
| **v0.1.5 书签工具（线上实测）** | ✅ curl-helper 内嵌新压缩书签（6.9KB），文案"翻一页 → 自动捕获（含 x-wrpa-0 签名头与请求体）"在线 |
| **v0.1.6 运行日历重写** | ✅ 已部署（`efd2fb9`），线上实测：JS chunk 含 `month-group`/月份判断、CSS chunk 含 `.month-group+.month-group{margin-left:10px}` 组间间隔、`.contrib-cell{aspect-ratio:1/1}` 铺满、绿/红状态色与"最新一条"逻辑在线 |
| **v0.1.7 状态同步 + 版本统一** | ✅ 已部署（`518d251`），健康检查 6/6，线上 bundle 实测含 classifyRun 四档逻辑、日历蓝/灰格子样式、本地时区归组与版本号 0.1.7 |
| **v0.1.8 Chrome 扩展 + 日历成功优先（推送部署中）** | ⏳ 已推送 `4fd2305`（扩展取代书签 + curl-helper 重构 + 日历成功优先/去图例），部署完成后待线上验证 |

线上验证工具：
- `verify-health.mjs` — 免 token 健康检查（入口/登录/守卫/curl-helper/bundle/favicon，任一失败退出码非 0）
- `verify-save.mjs` — 保存配置回归（token 从环境变量/`.env.local` 读取，不打印）

---

## 十一、完成标准

- [x] GitHub Pages 可访问入口 URL
- [x] PAT 登录 + Token 管理（localStorage + 退出清除 + Octokit 重置）
- [x] 仓库地址输入 + 自动检测 + workflow 自动发现
- [x] curl_bash 配置 + 一键获取引导 + 同步到 Secrets（sealed box 加密；v0.1.3 修复 watch 同步，输入真正落盘）
- [x] Chrome 扩展 + 图文教程（curl-helper，v0.1.8 取代书签；扩展可读 HttpOnly 凭证）
- [x] 推送配置（wxpusher 默认 + pushplus/telegram/serverchan）
- [x] 阅读时长分钟计数 + 快捷选择
- [x] 立即运行（仪表盘直接触发）+ 每日定时（配置页 ScheduleCard；停止/删除随任务页移除）
- [x] 运行日历（横向 GitHub 贡献图：列=周、行=周一~周日）+ 错误详情（job 纯文本日志解析）
- [x] 接口状态面板（项目/微信读书/推送；v0.1.3 起以远程 Secrets 存在性检测，显示真实状态）
- [x] 适配层 fallback 兼容机制（READ_NUM ↔ READ_MINUTES）
- [x] 测试覆盖（78 单测 + 4 E2E，构建通过）
- [x] Secrets 加密与 GitHub 服务器互操作（libsodium `crypto_box_seal`，线上保存 422 已修复）
- [x] 可选密码门（`VITE_PANEL_PASSWORD_HASH` 哈希注入，产物无明文；哈希生成脚本 `scripts/password-hash.mjs`）
- [x] 线上保存配置验证通过（`verify-save.mjs` 回归脚本）+ 线上健康检查（`verify-health.mjs`）
- [x] 记忆存储 + wxread 回读（配置持久化 localStorage；打开面板自动连接回读远程状态，仪表盘不误显"未配置"）
- [x] v0.1.4 布局重构：内容区全宽、控制入口卡片移除、最近运行横向日期轴、配置 5 模块平铺、任务页并入配置（已部署并线上验证）
- [x] v0.1.5 书签小工具 hook 捕获修复（x-wrpa-0 签名头 + 请求体 + content-type；`curlBuilder.ts` TDD 6 测试；esbuild 压缩脚本）——已部署并线上验证
- [x] v0.1.5 UI 微调：仪表盘"运行状态"+圆点/阅读时长/铺满、日历每日最新记录+去"少-多"、配置页保存右上角+"微信读书接口"+curl_bash 独立模块（已部署并线上验证）
- [x] v0.1.6 运行日历重写：每月独立网格（1 号居首格、不跨月）、CSS Grid 均分铺满、最新运行非失败即绿（`calendarGrid.ts` TDD 6 测试）——已部署并线上验证
- [x] v0.1.7 运行状态统一：`classifyRun` 四档分类（success/failure/running/idle）运行状态圆点与日历格子共用，日历新增蓝/灰格子与图例，状态完全同步（`runStatus.ts` TDD 5 测试）——已推送部署
- [x] v0.1.7 最近运行本地时区归组 + 响应式天数（`runGrouping.ts` TDD 7 测试，修复凌晨运行串日、窄屏最新日期截断）——已推送部署
- [x] v0.1.7 版本号同步机制：package.json 单一事实来源 + `scripts/bump-version.mjs` 一键三处同步（package.json/lock/deploy.sh），版本 0.1.7——已部署并线上验证
- [x] v0.1.8 Chrome 扩展取代书签：`chrome.cookies` API 读取 HttpOnly cookie（wr_vid/wr_skey/wr_rt）+ MAIN world hook 捕获 x-wrpa-0/请求体 → 完整 curl（`chrome-extension/` 目录 + README）；curl-helper 重构扩展升为方式一、书签移除（源码保留）；`build-bookmarklet.mjs` 改输出独立文件——已推送部署
- [x] v0.1.8 日历成功优先：`pickDayStatus`（当日任一成功即绿，无成功取最新，TDD 5 测试）并移除图例；单测 78 + E2E 4——已推送部署
- [ ] wxread 升级自诊断 banner（设计项，未实施）
