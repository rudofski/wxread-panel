# wxread-panel 扩展辅助工程设计文档

> 版本：v0.1.4  \
> 日期：2026-08-23  \
> 对应提交：`862be07`  \
> 关联仓库：[rudofski/wxread](https://github.com/rudofski/wxread/)  \
> v0.1.1 变更：移除书城搜索与 Cloudflare Worker 代理；认证改为纯 PAT；热力图改自绘实现  \
> v0.1.2 变更：Secrets 加密根因修复（tweetnacl 随机 nonce → libsodium `crypto_box_seal`）；新增可选密码门；线上保存配置验证通过（422 错误消失）  \
> v0.1.3 变更：**记忆存储 + wxread 回读**（配置持久化 localStorage，打开面板自动连接回读远程状态）；密码门哈希化（`VITE_PANEL_PASSWORD` → `VITE_PANEL_PASSWORD_HASH`，修复明文内联缺陷）；curl_bash 保存根因修复 + 仪表盘远程 Secrets 存在性检测；新增密码哈希脚本与线上健康检查脚本  \
> v0.1.4 变更：**UI 布局重构**——内容区全宽（保留侧边栏）；仪表盘移除控制入口卡片、最近运行改横向日期轴、立即运行直接触发；删除任务管理页（定时任务并入配置页）；配置 5 模块网格平铺；运行日历改横向 GitHub 贡献图风格

---

## 一、项目概述

### 1.1 定位

`wxread-panel` 是一个基于 **GitHub Pages** 部署的纯前端 Web 控制面板，与 `rudofski/wxread` 仓库联动，通过 GitHub API 实现配置管理、任务触发和运行状态监控。

### 1.2 核心决策总览

| # | 决策点 | 选择 |
|---|--------|------|
| 1 | 部署架构 | **GitHub Pages 纯静态 SPA** |
| 2 | 登录凭证获取 | **独立本地 HTML 工具**（书签小工具 + 图文教程，`/curl-helper/`） |
| 3 | 认证方式 | **Personal Access Token（纯 PAT）**——GitHub Pages 纯前端无法安全完成 OAuth code 交换 |
| 4 | 刷时长执行 | **触发 GitHub Actions**（`workflow_dispatch`） |
| 5 | 日历图表 | **自绘热力图**（轻量 CSS grid，替代 Cal-Heatmap 依赖） |
| 6 | 项目接口 | **输入仓库地址，通过 GitHub API 读写 Secrets/Variables** |
| 7 | 推送配置 | **面板配置 → GitHub Secrets → Actions 运行时推送** |
| 8 | 技术栈 | **Vue 3 + Vite + TypeScript + Octokit + libsodium-wrappers** |
| 9 | 书城搜索 | **已移除**（v0.1.0 曾引入；weread 搜索接口无 CORS 头，GitHub Pages 线上不可用，公共代理在国内不可达，故 v0.1.1 下线） |
| 10 | 访问密码 | **可选密码门**（构建变量 `VITE_PANEL_PASSWORD_HASH`=密码的 SHA-256 hex；v0.1.3 由明文 `VITE_PANEL_PASSWORD` 改为哈希，修复 Vite 内联明文缺陷；24h 解锁；防共用设备场景） |
| 11 | 记忆存储与回读 | **配置持久化 localStorage + 打开面板自动连接回读远程真实状态**（v0.1.3）——刷新/重开不丢配置，仪表盘显示真实远程状态而非"未配置" |

---

## 二、系统架构

### 2.1 整体拓扑

```
┌──────────────────────────────────────────────────────┐
│              GitHub Pages (gh-pages 分支)              │
│  ┌────────────────────────────────────────────────┐  │
│  │          Vue 3 SPA 控制面板                      │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │  │
│  │  │仪表盘│ │ 配置  │ │ 任务  │ │ 日历  │          │  │
│  │  └──────┘ └──────┘ └──────┘ └──────┘          │  │
│  │  └── curl-helper/ 独立工具（书签/F12/手动粘贴）  │  │
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
├── public/
│   ├── favicon.svg
│   └── curl-helper/             # 独立 curl_bash 获取工具
│       ├── index.html           #   三选一获取方式（书签/F12/手动粘贴）
│       └── bookmarklet.js       #   书签小工具源码（含压缩版）
├── scripts/
│   └── password-hash.mjs        # 生成密码门哈希（静默输入/环境变量，防泄漏）
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
│   │   └── panelLock.ts         # 可选密码门（哈希校验 + 24h 解锁态）
│   ├── components/
│   │   ├── LockScreen.vue       # 密码门解锁界面（可选）
│   │   ├── Sidebar.vue
│   │   └── config/
│   │       ├── RepoInput.vue    # 仓库地址输入 + 自动检测
│   │       ├── LoginConfig.vue  # curl_bash 输入（watch 同步 store）+ 一键获取引导
│   │       ├── PushConfig.vue   # 推送方式 + 各平台 token
│   │       ├── ReadConfig.vue   # 阅读时长（分钟 ↔ 次数）
│   │       └── ScheduleCard.vue # 定时任务设置（v0.1.4 从任务页并入配置页）
│   └── views/
│       ├── Dashboard.vue        # 仪表盘（状态面板 + 横向最近运行 + 立即运行直接触发）
│       ├── Config.vue           # 配置页面（5 模块网格平铺）
│       └── Calendar.vue         # 运行日历（横向 GitHub 贡献图）
├── tests/
│   ├── api/github.test.ts       # 纯函数（URL/错误解析）6
│   ├── api/github-api.test.ts   # mock Octokit 交互测试（含 secretExists）10
│   ├── stores/auth.test.ts      # 登录态 5
│   ├── stores/settings.test.ts  # 配置状态 + 持久化 roundtrip 7
│   ├── utils/schedule.test.ts   # 定时设置 6
│   ├── utils/sealedBox.test.ts  # 密封盒与 libsodium 互操作（模拟 GitHub 服务器）4
│   ├── utils/panelLock.test.ts  # 密码门（启用/校验/解锁态）6
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

### 5.2 布局与信息架构（v0.1.4）

- **全宽内容区**：保留左侧固定导航（仪表盘/配置/运行日历），各页面移除 `max-width` 限制，内容撑满剩余宽度
- **仪表盘**：移除"控制入口"卡片；最近运行以**日期为横轴**（最近 14 天，左早右近），每日一列、列内竖向排列该日多条记录（时间 + 状态图标 + 成功/失败/运行中），不显示项目名
- **配置页**：项目接口 / 登录方式 / 推送接口 / 阅读设置 / 定时任务 5 卡片**网格平铺**（`auto-fill minmax(340px, 1fr)`），保存按钮独立底部栏
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

### 5.7 curl_bash 获取（替代 v0.1.0 书城搜索）

微信读书登录凭证 `WXREAD_CURL_BASH` 无法跨站读取（cookies 隔离），通过 `/curl-helper/` 工具获取：

```
方式一（推荐）：书签小工具 —— 在微信读书阅读页点击书签 → 自动复制 curl_bash
方式二：F12 → Network → 过滤 read → Copy as cURL (bash)
方式三：手动粘贴并验证格式

配置页"登录方式"卡片内置一键获取入口（大按钮 + 三步引导）
```

### 5.8 运行日历（横向 GitHub 贡献图，v0.1.4）

```
Calendar.vue 加载
  → listWorkflowRuns({ per_page: 365 })
  → 按日期聚合 → 横向贡献图：列 = 周（52 列），行 = 周一 ~ 周日（7 行）
      🟢 success 绿   🔴 failure 红   🔵 running 蓝   ⬜ 未运行灰
  → 顶部月份标签（仅在月份变化列显示）+ 左侧星期标注（一/三/五）+ 底部图例
  → 点击格子 → 当日详情；失败日期异步拉取 job 纯文本日志 → parseRunError 提取中文原因
  → 统计：成功 / 失败 / 成功率
```

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
- 提供三种获取 `WXREAD_CURL_BASH` 方式（书签小工具 / F12 教程 / 手动粘贴）
- 书签小工具在微信读书阅读页点击即提取 cookies 生成 curl_bash 并复制
- 配置页"登录方式"卡片提供醒目一键入口（自动适配 base 路径）

---

## 九、测试策略

### 9.1 测试分层（实际）

| 层 | 范围 | 工具 | 数量 |
|----|------|------|------|
| 纯函数单测 | URL/错误解析（6）+ 定时设置（6） | Vitest | 12 |
| Mock API 交互 | detectRepo / variable / dispatch / 适配层 / 日志拉取 / secretExists | Vitest + vi.mock | 10 |
| Store 测试 | auth 登录态（5）、settings 配置状态 + 持久化 roundtrip（7） | Vitest + Pinia | 12 |
| 加密测试 | sealed box 与 libsodium 互操作（模拟 GitHub 服务器） | Vitest | 4 |
| 密码门测试 | 启用/禁用、哈希校验、24h 解锁态 | Vitest | 6 |
| E2E 冒烟 | 登录跳转 / token 输入 / 无 OAuth 按钮 | Playwright | 4 |

合计 **44** 个单元测试 + 4 个 E2E。组件层未单独引入测试框架（`@vue/test-utils` 未使用），组件行为由 E2E 冒烟覆盖。

### 9.2 关键测试用例

- 适配层：新旧变量名兼容、分钟↔次数转换、默认值回退
- 错误解析：Cookie 过期、推送失败、网络超时 → 对应中文提示
- 加密：**libsodium 能解封我们的密文**（GitHub 服务器等效）、非 ASCII 内容往返、密文随机性
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

线上验证工具：
- `verify-health.mjs` — 免 token 健康检查（入口/登录/守卫/curl-helper/bundle/favicon，任一失败退出码非 0）
- `verify-save.mjs` — 保存配置回归（token 从环境变量/`.env.local` 读取，不打印）

---

## 十一、完成标准

- [x] GitHub Pages 可访问入口 URL
- [x] PAT 登录 + Token 管理（localStorage + 退出清除 + Octokit 重置）
- [x] 仓库地址输入 + 自动检测 + workflow 自动发现
- [x] curl_bash 配置 + 一键获取引导 + 同步到 Secrets（sealed box 加密；v0.1.3 修复 watch 同步，输入真正落盘）
- [x] 书签小工具 + 图文教程（curl-helper）
- [x] 推送配置（wxpusher 默认 + pushplus/telegram/serverchan）
- [x] 阅读时长分钟计数 + 快捷选择
- [x] 立即运行（仪表盘直接触发）+ 每日定时（配置页 ScheduleCard；停止/删除随任务页移除）
- [x] 运行日历（横向 GitHub 贡献图：列=周、行=周一~周日）+ 错误详情（job 纯文本日志解析）
- [x] 接口状态面板（项目/微信读书/推送；v0.1.3 起以远程 Secrets 存在性检测，显示真实状态）
- [x] 适配层 fallback 兼容机制（READ_NUM ↔ READ_MINUTES）
- [x] 测试覆盖（44 单测 + 4 E2E，构建通过）
- [x] Secrets 加密与 GitHub 服务器互操作（libsodium `crypto_box_seal`，线上保存 422 已修复）
- [x] 可选密码门（`VITE_PANEL_PASSWORD_HASH` 哈希注入，产物无明文；哈希生成脚本 `scripts/password-hash.mjs`）
- [x] 线上保存配置验证通过（`verify-save.mjs` 回归脚本）+ 线上健康检查（`verify-health.mjs`）
- [x] 记忆存储 + wxread 回读（配置持久化 localStorage；打开面板自动连接回读远程状态，仪表盘不误显"未配置"）
- [x] v0.1.4 布局重构：内容区全宽、控制入口卡片移除、最近运行横向日期轴、配置 5 模块平铺、任务页并入配置（已部署并线上验证）
- [ ] wxread 升级自诊断 banner（设计项，未实施）
