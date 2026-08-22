# wxread-panel 扩展辅助工程设计文档

> 版本：v0.1.0  
> 日期：2026-08-23  
> 关联仓库：[rudofski/wxread](https://github.com/rudofski/wxread/)  
> 参考项目：[takukaiyo/wxread](https://github.com/takukaiyo/wxread/)

---

## 一、项目概述

### 1.1 定位

`wxread-panel` 是一个基于 **GitHub Pages** 部署的纯前端 Web 控制面板，与 `rudofski/wxread` 仓库联动，通过 GitHub API 实现配置管理、任务触发和运行状态监控。

### 1.2 核心决策总览

| # | 决策点 | 选择 |
|---|--------|------|
| 1 | 部署架构 | **GitHub Pages 纯静态 SPA** |
| 2 | 扫码登录 | **独立本地 HTML 工具**（书签小工具 + 图文教程） |
| 3 | 认证方式 | **GitHub OAuth App** |
| 4 | 刷时长执行 | **触发 GitHub Actions**（`workflow_dispatch`） |
| 5 | 日历图表 | **贡献图风格热力图**（Cal-Heatmap.js） |
| 6 | 项目接口 | **输入仓库地址，通过 GitHub API 读写 Secrets/Variables** |
| 7 | 推送配置 | **面板配置 → GitHub Secrets → Actions 运行时推送** |
| 8 | 技术栈 | **Vue 3 + Vite + TypeScript + Octokit** |

---

## 二、系统架构

### 2.1 整体拓扑

```
┌──────────────────────────────────────────────────────┐
│              GitHub Pages (gh-pages 分支)              │
│  ┌────────────────────────────────────────────────┐  │
│  │          Vue 3 SPA 控制面板                      │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │  │
│  │  │仪表盘│ │ 配置  │ │书城  │ │ 任务  │ │ 日历  │ │  │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │ GitHub OAuth Token          │
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
- **零后端依赖**：OAuth 令牌存 localStorage，无服务器

---

## 三、技术栈

| 类别 | 选型 | 原因 |
|------|------|------|
| 框架 | Vue 3 + Composition API | 组件化，适合多模块面板 |
| 构建 | Vite | 快速 HMR，生产构建体积小 |
| 语言 | TypeScript | 类型安全，适合 API 对接 |
| 路由 | Vue Router 4 | SPA 页面切换 |
| 状态管理 | Pinia | 轻量，TypeScript 友好 |
| GitHub API | @octokit/rest | 官方 SDK，覆盖全部 API |
| 热力图 | cal-heatmap | 开箱即用的 GitHub 风格热力图 |
| HTTP | axios | 书城搜索等非 GitHub API 请求 |
| 测试 | Vitest + Vue Test Utils + MSW + Playwright | 全链路覆盖 |
| 部署 | GitHub Actions (deploy → gh-pages) | 自动化构建部署 |

---

## 四、项目结构

```
wxread-panel/                     # 独立仓库
├── .github/workflows/
│   └── deploy.yml               # 构建 + 部署到 gh-pages
├── public/
│   ├── favicon.ico
│   └── curl-helper/             # 独立本地扫码工具
│       ├── index.html           #   三选一获取方式
│       ├── tutorial.html        #   F12 Network 图文教程
│       └── bookmarklet.js       #   书签小工具源码
├── src/
│   ├── main.ts                  # 入口，初始化 OAuth + Router
│   ├── App.vue                  # 根组件，侧边栏 + 路由视图
│   ├── router.ts                # 路由定义
│   ├── api/
│   │   ├── github.ts            # Octokit 封装（OAuth、API）
│   │   └── weread.ts            # 微信读书书城搜索 API
│   ├── stores/
│   │   ├── auth.ts              # OAuth 登录态（Pinia）
│   │   └── settings.ts          # 配置状态
│   ├── components/
│   │   ├── Sidebar.vue
│   │   ├── calendar/
│   │   │   └── Heatmap.vue      # Cal-Heatmap 封装
│   │   ├── config/
│   │   │   ├── RepoInput.vue    # 仓库地址输入 + 自动检测
│   │   │   ├── LoginConfig.vue  # curl_bash 输入 + 工具引导
│   │   │   ├── PushConfig.vue   # 推送方式 + WXPUSHER_SPT
│   │   │   └── ReadConfig.vue   # 阅读时长（分钟 ↔ 次数）
│   │   ├── task/
│   │   │   ├── RunButton.vue    # 立即运行按钮
│   │   │   ├── ScheduleForm.vue # 定时任务设置
│   │   │   └── TaskList.vue     # 运行历史列表
│   │   └── books/
│   │       ├── BookSearch.vue   # 书城搜索
│   │       ├── BookResults.vue  # 搜索结果展示
│   │       └── SelectedBooks.vue# 已选书籍列表
│   └── views/
│       ├── Dashboard.vue        # 仪表盘首页
│       ├── Config.vue           # 配置页面
│       ├── Books.vue            # 书城选书页面
│       ├── Tasks.vue            # 任务管理页面
│       └── Calendar.vue         # 日历图表页面
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## 五、核心数据流

### 5.1 OAuth 认证

```
用户打开面板
  → 未登录 → 跳转 GitHub OAuth authorize 页面
  → 用户授权 → 回调面板（code 参数）
  → 前端用 code 换取 access_token（scope: repo, workflow）
  → 存入 localStorage → 初始化 Octokit → 进入仪表盘
```

### 5.2 配置读写

```
面板 Config.vue
  READ_NUM: 60 分钟 → 内部转换 120 次
  PUSH_METHOD: wxpusher
  WXPUSHER_SPT: AT_xxxx

保存时：
  → github.ts.updateVariables({ READ_NUM: "120", PUSH_METHOD: "wxpusher", SELECTED_BOOKS: "..." })
  → github.ts.updateSecret({ WXPUSHER_SPT: "AT_xxxx", WXREAD_CURL_BASH: "curl '...'" })

读取时：
  → Variables 可读：直接获取 READ_NUM、PUSH_METHOD
  → Secrets 不可读：仅标记"已配置"或"未配置"
```

### 5.3 触发运行

```
用户点击"立即运行"
  → github.ts.dispatchWorkflow({ owner, repo, workflow_id, ref })
  → GitHub Actions 启动
  → 前端轮询 GET /repos/.../actions/runs（每 10s）
  → 状态变化 → 更新任务列表 + 热力图
```

### 5.4 书城搜索

```
BookSearch.vue 输入关键词
  → weread.ts.searchBooks(keyword)
  → GET https://weread.qq.com/web/search/global?keyword=...
  → 返回 [{bookId, title, author, cover}, ...]
  → 用户勾选 → 加入 SELECTED_BOOKS → 保存到 GitHub Variables
```

### 5.5 日历热力图

```
Calendar.vue 加载
  → github.ts.listWorkflowRuns({ per_page: 200 })
  → 按日期聚合 runs → [{date, status, count, error}]
  → Cal-Heatmap 渲染：
      🟢 success  ■ 绿色
      🔴 failure  ■ 红色
      ⚪ 未运行    □ 灰色
      🔵 running  ■ 蓝色
  → hover 显示详情 → 点击弹出完整日志
```

---

## 六、错误处理与状态监控

### 6.1 三层监控

| 接口 | 检测方式 | 正常 | 异常表现 |
|------|---------|------|---------|
| 项目接口 | `GET /repos/{owner}/{repo}` | 🟢 响应 200 | 🔴 显示错误原因（404/403/超时） |
| 微信读书 | 用 curl_bash 发送探测请求 | 🟢 `succ:1` | 🟡 Cookie 过期 → 提示重新登录 |
| 推送接口 | Actions 日志中的推送状态 | 🟢 推送成功 | 🔴 解析日志错误信息 |

### 6.2 Actions 失败处理

```
Actions Run 失败
  → 拉取 runs list → 发现 status: "failure"
  → 拉取该 run 日志 → 解析错误行
  → 热力图红格 + tooltip 精简错误
  → 点击热力图 → 弹出详情（时间、完成次数、错误原因、完整日志链接）
```

### 6.3 前端异常分级

| 层次 | 场景 | 处理 |
|------|------|------|
| 网络 | API 超时/限流 | 提示 + 重试按钮 |
| 认证 | Token 过期/权限不足 | 自动跳转重新授权 |
| 业务 | curl_bash 无效 | 红色边框 + 错误提示 |
| 业务 | 无选中书籍 | 运行按钮置灰 + 提示 |
| 业务 | 任务已在运行 | "已有任务正在运行中" |

---

## 七、wxread 升级自动对接

### 7.1 适配层设计

所有 GitHub Variables/Secrets 的读写通过统一适配层 `api/github.ts` 完成：

```typescript
// 适配层转换
const wxreadAdapter = {
  fromGitHub(): PanelSettings {
    // readNum: vars.READ_MINUTES ? vars.READ_MINUTES * 2 : parseInt(vars.READ_NUM)
    // 自动兼容新旧变量名
  },
  toGitHub(settings: PanelSettings): void {
    // 分钟 → 次数：writeNum = settings.readMinutes * 2
  }
};
```

### 7.2 三层兼容机制

| 层次 | 机制 | 说明 |
|------|------|------|
| 变量映射 | 适配层 fallback | 新旧变量名都尝试，优先级：新名 > 旧名 > 默认值 |
| 版本探测 | workflow 扫描 | 面板自动读取 `.github/workflows/*.yml`，解析参数结构 |
| 自诊断 | 仪表盘 banner | 检测到不匹配时显示"检测到 wxread 升级，部分功能需适配" |

### 7.3 升级场景处理表

| wxread 升级场景 | 面板应对 |
|----------------|---------|
| 变量名变更（`READ_NUM→READ_MINUTES`） | 适配层 fallback，两名称都试 |
| 新增变量（如 `BOOK_CHAPTERS`） | 配置页动态增加表单项 |
| 工作流改名（`main.yml→read.yml`） | 自动扫描 `workflows/` 目录发现 |
| 推送方式新增（如 `dingtalk`） | 解析 workflow option 动态生成选项 |
| 不兼容大版本 | 弹出升级提示，引导用户更新面板 |

---

## 八、独立本地扫码工具

### 8.1 工具定位

部署在面板同域下（`/curl-helper/`），双击即可打开的静态 HTML 页面，提供三种获取 `WXREAD_CURL_BASH` 的方式。

### 8.2 方式一：书签小工具（推荐）

用户将一段 JavaScript 保存为浏览器书签。在微信读书页面点击书签即可自动提取 cookies 并生成 curl_bash，一键复制到剪贴板。

```javascript
javascript:(function(){
  const cookies = document.cookie;
  const ua = navigator.userAgent;
  const bash = `curl 'https://weread.qq.com/web/book/read' ` +
    `-H 'accept: application/json, text/plain, */*' ` +
    `-H 'user-agent: ${ua}' ` +
    `-b '${cookies}'`;
  const ta = document.createElement('textarea');
  ta.value = bash; document.body.appendChild(ta);
  ta.select(); document.execCommand('copy');
  document.body.removeChild(ta);
  alert('✅ curl_bash 已复制到剪贴板！');
})();
```

### 8.3 方式二：图文教程

F12 → Network → 过滤 `read` → 右键 → Copy → Copy as cURL (bash)

### 8.4 方式三：手动粘贴

提供文本框，用户从其他渠道获取的 curl_bash 直接粘贴。

### 8.5 与面板的集成

面板配置页的"登录方式"区域提供链接 `[打开 curl_bash 获取工具 ↗]`，指向 `/curl-helper/index.html`。

---

## 九、测试策略

### 9.1 测试分层

| 层 | 范围 | 工具 | CI 触发 |
|----|------|------|---------|
| 单元测试 | 纯函数、转换器、工具函数 | Vitest | PR / push |
| 组件测试 | Vue 组件渲染 + 交互 | Vitest + Vue Test Utils | PR / push |
| API Mock 集成 | GitHub API + 书城搜索 | MSW | PR / push |
| E2E | 关键用户路径 | Playwright | main 分支 |

### 9.2 关键测试用例

- **适配层**：新旧变量名兼容、分钟↔次数转换、多书 ID 解析、默认值回退
- **错误解析**：Cookie 过期、推送失败、网络超时 → 对应中文提示
- **E2E**：OAuth 登录 → 配置推送 → 选书 → 触发运行 → 查看结果

---

## 十、部署方案

### 10.1 仓库创建

```bash
# 新建独立仓库
gh repo create wxread-panel --public
```

### 10.2 OAuth App 注册

- 在 GitHub Settings → Developer settings → OAuth Apps 注册
- Callback URL: `https://rudofski.github.io/wxread-panel/`
- 获取 Client ID，Client Secret 写入仓库 Secrets（构建时注入）

### 10.3 CI/CD

`.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v3
```

### 10.4 Pages 配置

- Source: `gh-pages` 分支，`/ (root)` 目录
- 自定义域名（可选）

---

## 十一、完成标准

- [x] GitHub Pages 可访问入口 URL
- [ ] OAuth 登录 + Token 管理
- [ ] 仓库地址输入 + 自动检测
- [ ] curl_bash 配置 + 验证 + 同步到 Secrets
- [ ] 书签小工具 + 图文教程
- [ ] 推送配置（wxpusher 默认）
- [ ] 阅读时长分钟计数 + 快捷选择
- [ ] 书城搜索 + 多选 + 保存
- [ ] 立即运行 + 定时任务 + 停止
- [ ] 热力图展示 + 错误详情
- [ ] 接口状态面板（项目/微信读书/推送）
- [ ] 适配层 fallback 兼容机制
- [ ] 测试覆盖（单元 + 组件 + E2E）
- [ ] wxread 升级自动检测提醒