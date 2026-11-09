# wxread-panel 守护工作流与接口状态显示 — 设计规格

- 日期：2026-11-09
- 版本目标：0.1.20 → 0.2.0
- 状态：设计已确认（6 节全部通过）

## 1. 背景与问题

`rudofski/wxread` 是 fork 自 `findmover/wxread` 的仓库。GitHub 对 fork 仓库的策略是：**fork 后仓库内所有工作流默认停用**，Actions 页面显示 `Workflows aren't being run on this forked repository`，需要人工点击 `I understand my workflows, go ahead and enable them` 才会恢复。因此定时任务会静默失效，而且用户很难及时发现。

`wxread` 现有的 `deploy.yml` 里虽有 `keepalive-job`（`liskin/gh-workflow-keepalive@v1.2.1`），但它只解决“60 天仓库无活动导致 schedule 被自动停用”，**无法**解决 fork 停用问题——而且停用发生后 keepalive 自身也不会运行。

同时，`wxread-panel` 作为配套面板，缺少两个关键可观测性：

1. 无法看出 `wxread` 的 Actions 工作流当前是否可用；
2. 无法看出推送接口（`push.py` 的四通道）是否配置完整。

## 2. 目标

| 编号 | 目标 |
|---|---|
| G1 | 面板「配置参数 → 项目接口」中，`Actions 工作流（自动发现）` 下方显示工作流状态，例如 `🟢 Actions 工作流正常`，样式与 `🟢 已连接 rudofski/wxread` 一致 |
| G2 | 每日定时运行之前自动检查 `wxread` 的 Actions 工作流状态，发现停用/异常时自动重启（enable + 补跑） |
| G3 | 面板「配置参数 → 推送接口」中显示推送接口状态，例如 `🟢 推送接口正常`，样式同上 |
| G4 | 每日 12:00 检查 `wxread` 的 Actions 运行结果；若 12:00 前没有成功运行，通过复刻 `wxread` 推送接口的方式推送异常报告 |
| G5 | 本地修改、检测无误后再推送到 GitHub |

## 3. 非目标

- 不修改 `wxread` 仓库的任何代码（不向其提交 commit）。守护全部在 `wxread-panel` 侧完成。
- 不引入后端服务。面板仍是纯静态 SPA，无人值守能力由 GitHub Actions 承担。
- 不做推送测试消息实发验证（用户选择：只做凭证完整性校验）。

## 4. 已确认的关键事实（来自对真实仓库的核查）

| 事实 | 来源 |
|---|---|
| `wxread` 只有一个工作流：`name: wxread`、`path: .github/workflows/deploy.yml`、`id: 235172077`、`state: active` | `GET /repos/rudofski/wxread/actions/workflows` |
| 定时：`cron: '0 21 * * *'` = 北京时间每日 **05:00**；另有 `workflow_dispatch` | `deploy.yml` |
| 并发组 `wxread`，`cancel-in-progress: true` | `deploy.yml` |
| 推送实现为 `push.py`，支持 `pushplus / telegram / wxpusher / serverchan` | `push.py` |
| 推送渠道由 **`secrets.PUSH_METHOD`** 决定（`deploy.yml` 中 `PUSH_METHOD: ${{ secrets.PUSH_METHOD }}`） | `deploy.yml` |
| `workflows[].state` 取值含 `active / disabled_manually / disabled_inactivity` | GitHub REST API |
| `PUT /repos/{o}/{r}/actions/workflows/{id}/enable` 用于启用工作流 | GitHub REST API |

## 5. 架构

```
┌─ GitHub Actions（无人值守，解决根因）─────────────────────┐
│  wxread-panel/.github/workflows/guard.yml                 │
│   cron 04:45（每日运行前预检）+ 05:30（宽限复查）+ 12:00（巡检推送）│
│   脚本 scripts/guard/*.mjs（Node 20，零依赖，可本地跑）      │
└───────────────┬───────────────────────────────────────────┘
                │ GitHub REST API（PAT）
                ▼
      rudofski/wxread（deploy.yml / id 235172077）
                │
┌───────────────┴─── 浏览器面板（状态展示）──────────────────┐
│  RepoInput.vue：🟢 Actions 工作流正常                     │
│  PushConfig.vue：🟢 推送接口正常                           │
└───────────────────────────────────────────────────────────┘
```

### 5.1 关键决策

1. **守护用 PAT，不用 `GITHUB_TOKEN`**。`GITHUB_TOKEN` 作用域仅限 `wxread-panel` 本仓库，无法读取或修改 `rudofski/wxread`。
2. **守护工作流放在 `wxread-panel`**（用户确认方案 A）。放在 `wxread` 会自我失效——被守护对象停用时守护自身一起停用。
3. **判定依据 `workflows[].state`**：`active` = 正常；`disabled_manually` / `disabled_inactivity` = 异常。
4. **修复动作三元组**：`enable` → 复核 state 已为 `active` → `dispatches`（`ref: main`）。只 enable 不 dispatch 会错过当天 05:00。
5. **幂等去重**：状态记录在 `wxread-panel` 仓库的 Actions Variable `GUARD_STATE`（JSON），避免多轮 cron 重复 dispatch / 重复告警。
6. **推送不依赖 wxread**：异常报告由 guard 自己复刻 `push.py` 的四通道直发，wxread 挂了也能收到通知。

### 5.2 可配置参数（`guard.yml` 的 `env`）

| 变量 | 默认 | 含义 |
|---|---|---|
| `TARGET_OWNER` / `TARGET_REPO` | `rudofski` / `wxread` | 被守护仓库 |
| `TARGET_WORKFLOW` | `deploy.yml` | 工作流路径匹配 |
| `TARGET_REF` | `main` | dispatch ref |
| `CRON_HOUR_LOCAL` | `5` | wxread 每日计划运行小时（Asia/Shanghai） |
| `PREFLIGHT_LEAD_MIN` | `15` | 预检提前量（分钟） |
| `HOURLY_GRACE_MIN` | `60` | 已过计划点后等待其自行运行的宽限 |
| `INSPECT_HOUR_LOCAL` | `12` | 巡检小时 |
| `PUSH_CONTENT_MAX` | `3000` | 推送正文截断长度 |

## 6. 工作流定义

```yaml
name: wxread Guard
on:
  schedule:
    - cron: '45 20 * * *'   # 04:45 北京时间：每日定时之前
    - cron: '30 21 * * *'   # 05:30 北京时间：计划点后宽限复查
    - cron: '0 4 * * *'     # 12:00 北京时间：结果巡检 + 推送
  workflow_dispatch:
    inputs:
      mode: { description: 'auto | preflight | inspect | all | check', default: 'auto' }
concurrency:
  group: wxread-guard
  cancel-in-progress: false
permissions:
  contents: read
```

`mode=auto` 时脚本按当前北京时间自判：

- `04:00–05:00` → `preflight`
- `05:00–11:00` → `preflight`（宽限复查，靠 `GUARD_STATE` 去重）
- `11:30–12:30` → `inspect`
- 其它（手动触发）→ `all`

`push` 步骤的 secrets 与 `wxread` 侧同名同值，保证同一通道。

## 7. 守护脚本设计

### 7.1 文件职责

| 文件 | 职责 |
|---|---|
| `scripts/guard/github.mjs` | REST 封装：`fetch` + 超时 + 重试 + 错误归类（`{status, message, code}`） |
| `scripts/guard/workflow.mjs` | 查 state / enable / dispatch / 查当日运行 / 读写 `GUARD_STATE` |
| `scripts/guard/push.mjs` | 复刻 `push.py` 四通道 |
| `scripts/guard/report.mjs` | 生成异常报告 Markdown |
| `scripts/guard/decide.mjs` | 纯函数决策 |
| `scripts/guard/main.mjs` | CLI 入口，串联并给出退出码 |

### 7.2 决策纯函数

```js
// decide({ mode, now, workflowState, runs, scheduledHour, graceMin, inspectHour })
// → { needRepair, needDispatch, needAlert, reason }
```

规则优先级：

1. `workflowState !== 'active'` → `needRepair = true`
2. 今日存在 `status === 'completed' && conclusion === 'success'` → 不再 dispatch、不再告警
3. 今日存在 `status` 为 `queued` / `in_progress` / `waiting` / `requested` / `pending` → 等待，不干预
4. 已过 `scheduledHour` + `graceMin` 且今日无任何运行 → `needDispatch = true`
5. `mode === 'inspect'` 且已过 `inspectHour` 且今日无成功 → `needAlert = true`

“今日”以 `Asia/Shanghai` 的 `00:00` 起算，运行时间取 `run_started_at || created_at`。

### 7.3 修复链路

```js
async function preflight(cfg) {
  const wf = await getWorkflow(cfg);
  const wasActive = wf.state === 'active';
  if (!wasActive) {
    await enableWorkflow(cfg, wf.id);
    await sleep(2000);
    const after = await getWorkflow(cfg);
    if (after.state !== 'active') throw new GuardError(`enable 未生效: ${after.state}`);
  }
  const runs = await listTodayRuns(cfg);
  const d = decide({ mode: 'preflight', now: localNow(), workflowState: 'active', runs, ... });
  if (d.needDispatch) await dispatchWorkflow(cfg, wf.id, cfg.ref);
  return { state: wf.state, repaired: !wasActive, dispatched: d.needDispatch, reason: d.reason };
}
```

`enable` 返回 403/404（PAT 权限不足、仓库已归档）时：不抛栈，把 `httpStatus + message` 写入 `GUARD_STATE.lastError`，**照走推送告警**，退出码 1。

## 8. 推送复刻

| 渠道 | 请求 | 复刻点 |
|---|---|---|
| `pushplus` | `POST https://www.pushplus.plus/send`，body `{token, title, content}` | 标题前缀 `微信阅读-` |
| `wxpusher` | `GET https://wxpusher.zjiecode.com/api/send/message/{spt}/{content}` | content 在 URL path，必须 `encodeURIComponent` + 截断到 `PUSH_CONTENT_MAX`（原 `push.py` 不截断，长文会 414） |
| `telegram` | `POST https://api.telegram.org/bot{token}/sendMessage`，body `{chat_id, text}` | 保留“带代理失败 → 直连兜底”两次尝试 |
| `serverchan` | `POST https://sctapi.ftqq.com/{spt}.send`，body `{title, desp}` | 字段名是 `desp` 不是 `content` |

**重试策略（刻意偏离原版）**：`push.py` 为 `5 次 × sleep 180~360s`；guard 改为 `3 次，退避 5s / 20s / 60s`。理由：guard 必须在 cron 窗口内完成，3 分钟级重试会占满 runner；已验证用户同意此偏离。

**异常报告模板**

```markdown
## ⚠️ wxread 每日运行异常报告

**检查时间**：2026-11-10 12:00:12（Asia/Shanghai）
**目标仓库**：rudofski/wxread · 工作流 deploy.yml
**工作流状态**：active（正常）
**今日计划运行**：05:00（cron '0 21 * * *'）

### 今天（11-10）的运行情况
- 共 2 条记录
- ❌ 05:03 失败 — conclusion: failure，耗时 4分12秒
- ⏭ 04:45 手动触发 — conclusion: cancelled

### 判定
12:00 之前今日**没有任何成功运行**。

### 已执行的动作
- 04:45 预检：工作流状态 active，无需启用
- 05:30 复查：已触发一次补跑（dispatch，ref=main）
- 补跑结果：❌ 仍失败

### 建议
1. 打开 Actions 页面查看失败日志：https://github.com/rudofski/wxread/actions
2. 高频原因：WXREAD_CURL_BASH 的 Cookie 过期 → 重新用 F12 复制 curl 并保存
```

## 9. `GUARD_STATE` 变量

存放于 `wxread-panel` 仓库 Actions Variables，JSON：

```json
{
  "date": "2026-11-10",
  "dispatchedAt": "2026-11-10T05:30:04+08:00",
  "alertedAt": "2026-11-10T12:00:12+08:00",
  "lastState": "active",
  "lastError": ""
}
```

- 不存在时自动 `POST /actions/variables` 创建；创建失败降级为“本次不做去重”，不影响主流程。
- 日期变更自动重置。

## 10. 面板改动

### 10.1 `src/api/github.ts`

```ts
export interface WorkflowState { id: number; name: string; path: string; state: string; }
export async function getWorkflowState(
  owner: string, repo: string, pathOrId?: string | number,
): Promise<WorkflowState | null>
```

按 `path`（如 `deploy.yml`）或 `id` 匹配；找不到返回 `null`。

### 10.2 `src/utils/pushStatus.ts`（新增纯函数）

```ts
export type PushStatus = 'ok' | 'warn' | 'error' | 'unknown';

//  ''           → 'warn'   未启用推送
//  'wxpusher'   → WXPUSHER_SPT 存在 ? ok : error（缺 WXPUSHER_SPT）
//  'pushplus'   → PUSHPLUS_TOKEN 存在 ? ok : error
//  'telegram'   → TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID 都存 ? ok : error
//  'serverchan' → SERVERCHAN_SPT 存在 ? ok : error
//  远程 Secrets 状态尚未加载（对象为空）→ 'unknown'
```

文案：`ok → 🟢 推送接口正常`，`error → 🔴 推送接口未配置完整（缺少 X）`，`warn → 🟡 未启用推送`，`unknown → 🟡 正在检测...`。

### 10.3 `RepoInput.vue`

在 `Actions 工作流（自动发现）` 的 `select` 下方增加状态行，复用既有 `.status-msg.ok / .error`：

- `🟢 Actions 工作流正常`
- `🔴 Actions 工作流已停用（需启用）`
- `🟡 无法读取工作流状态`

### 10.4 `PushConfig.vue`

卡片底部增加同款状态行，数据源为 `settings.remoteSecrets` + `settings.pushMethod`。

### 10.5 顺带修正现存 Bug

`wxreadAdapter.toGitHub()` 当前写 `PUSH_METHOD` 为 **Variable**，但 `wxread/deploy.yml` 读 `secrets.PUSH_METHOD`。改为写 Secret：

```ts
if (settings.pushMethod) await updateSecret(owner, repo, 'PUSH_METHOD', settings.pushMethod);
```

并在 `remoteSecrets` 名单中加入 `PUSH_METHOD`，用于面板判定。注意 Secrets 有分钟级传播延迟，状态位文案加提示。

## 11. 测试策略

| 文件 | 覆盖 |
|---|---|
| `tests/guard/decide.test.ts` | 决策全分支 |
| `tests/guard/push.test.ts` | 四通道 URL/body 构造；wxpusher 编码截断；telegram 兜底；serverchan `desp`；重试次数与退避序列；无渠道返回 `ok:false` 不抛 |
| `tests/guard/report.test.ts` | 报告含检查时间/状态/明细/判定/建议；无运行时不崩 |
| `tests/utils/pushStatus.test.ts` | 四渠道 ok/error/warn/unknown |
| `tests/api/workflowState.test.ts` | 按 path/id 匹配；找不到返回 null |
| `tests/stores/settings.test.ts` | 补 `PUSH_METHOD` 走 Secret 的断言 |

全部用 fetch mock，不连真网。

## 12. 错误处理与退出码

| 退出码 | 含义 |
|---|---|
| `0` | 一切正常，无需动作（或巡检发现已成功） |
| `2` | 执行了修复动作但存在告警（如 enable 成功但补跑失败、推送失败） |
| `1` | 修复失败需人工（PAT 缺失/权限不足/仓库归档/无法读取工作流） |

推送失败不改变主判定，只追加 `::error::` annotation。

## 13. 交付物清单

```
新增  .github/workflows/guard.yml
新增  scripts/guard/{main,github,workflow,decide,push,report}.mjs
新增  src/utils/pushStatus.ts
新增  tests/guard/{decide,push,report}.test.ts
新增  tests/utils/pushStatus.test.ts
新增  tests/api/workflowState.test.ts
新增  docs/superpowers/specs/2026-11-09-guard-workflow-design.md
修改  src/api/github.ts          + getWorkflowState
修改  src/components/config/RepoInput.vue    + 工作流状态行
修改  src/components/config/PushConfig.vue   + 推送状态行
修改  src/stores/settings.ts     + workflowState、PUSH_METHOD 改 Secret
修改  package.json               version 0.1.20 → 0.2.0
修改  README.md                  新增“守护工作流”一节（含 PAT 创建步骤）
```

## 14. 用户手工前置条件

在 `wxread-panel` 仓库 `Settings → Secrets and variables → Actions` 配置：

| Secret | 值 |
|---|---|
| `WXREAD_GUARD_PAT` | 经典 PAT，勾选 `repo`（Fine-grained 则需 Actions: read/write + Contents: read），能访问 `rudofski/wxread` |
| `PUSH_METHOD` | 与 wxread 侧一致，如 `wxpusher` |
| `PUSHPLUS_TOKEN` / `WXPUSHER_SPT` / `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `SERVERCHAN_SPT` | 与 wxread 侧同值 |

未配置 `WXREAD_GUARD_PAT` 时 guard 以退出码 1 结束并提示，不产生任何副作用。

## 15. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `wxread-panel` 自身也被停用，守护失效 | 该仓库每次 push 都会跑 `deploy.yml`，保持活跃；且可在 wxread 的 fork 停用问题修复后再观察 |
| GitHub cron 实际延迟 5–15 分钟 | 预检提前 15 分钟；宽限 60 分钟；12:00 巡检窗口 11:30–12:30 |
| PAT 泄露 | 仅存于仓库 Secrets，脚本不打印；guard 日志对 token 做脱敏 |
| 重复 dispatch 刷时长 | `GUARD_STATE` 按日去重 + “今日已成功则不 dispatch” |
