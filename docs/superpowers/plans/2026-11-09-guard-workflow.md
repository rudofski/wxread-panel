# wxread 守护工作流与接口状态显示 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 wxread-panel 增加「Actions 工作流状态」「推送接口状态」两个面板状态位，并新增一个无人值守的 GitHub Actions 守护工作流，每日运行前自动启用/补跑 wxread 的 Actions，12:00 巡检未成功则推送异常报告。

**架构：** 守护逻辑写成零依赖 Node ESM 脚本（`scripts/guard/*.mjs`），由 `wxread-panel/.github/workflows/guard.yml` 定时调用；核心判定抽成纯函数 `decide()` 便于 TDD。面板侧新增 `getWorkflowState()` API 与 `pushStatus.ts` 纯函数，供 `RepoInput.vue` / `PushConfig.vue` 渲染状态行。

**技术栈：** Vue 3 + Pinia + TypeScript（面板）、Node 20 ESM（守护脚本，仅用全局 `fetch`）、vitest + happy-dom（测试）、GitHub REST API v2022-11-28。

**规格来源：** `docs/superpowers/specs/2026-11-09-guard-workflow-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `scripts/guard/decide.mjs` | **纯函数**决策：给定 now / workflowState / 今日 runs / 模式 → `{ needRepair, needDispatch, needAlert, reason }`。无 IO、无 Date.now 调用（时间由参数注入） |
| `scripts/guard/push.mjs` | 复刻 `push.py` 四通道：构造请求 + 重试退避。导出 `buildPushRequest()`（纯函数）与 `sendPush()`（带 fetch） |
| `scripts/guard/report.mjs` | 异常报告 Markdown 生成（纯函数） |
| `scripts/guard/github.mjs` | REST 封装：`ghRequest()`（fetch + 超时 + 错误归类）、`parseGuardEnv()`、`GUARD_STATE` 读写 |
| `scripts/guard/workflow.mjs` | 工作流域逻辑：`getTargetWorkflow()` / `enableWorkflow()` / `dispatchWorkflow()` / `listTodayRuns()` |
| `scripts/guard/main.mjs` | CLI 入口：解析 `--mode`，串联 preflight / inspect，输出结论，给退出码 |
| `src/utils/pushStatus.ts` | **纯函数**推送凭证完整性判定 |
| `src/api/github.ts`（改） | 新增 `getWorkflowState()`；`toGitHub()` 的 `PUSH_METHOD` 改写 Secret |
| `src/stores/settings.ts`（改） | 新增 `workflowState` ref、`refreshWorkflowState()`；`remoteSecrets` 名单加 `PUSH_METHOD` |
| `src/components/config/RepoInput.vue`（改） | 工作流状态行 |
| `src/components/config/PushConfig.vue`（改） | 推送接口状态行 |
| `.github/workflows/guard.yml` | 定时触发守护脚本 |

**分层理由：** `decide.mjs` 与 `report.mjs`、`buildPushRequest()`、`pushStatus.ts` 都不碰网络和时钟，测试无需 mock；`workflow.mjs` / `github.mjs` 只做 IO 编排，靠 `main.mjs --mode check` 做端到端冒烟。

---

## 任务 1：决策纯函数 `decide()`

**文件：**
- 创建：`scripts/guard/decide.mjs`
- 测试：`tests/guard/decide.test.ts`

**行为契约（来自规格 §7.2）：**

```js
decide({ mode, now, workflowState, runs, scheduledHour = 5, graceMin = 60, inspectHour = 12 })
// → { needRepair, needDispatch, needAlert, reason }
```

- `now` 是 `Asia/Shanghai` 的 `Date`；`runs[].when` 是 ISO 时间串（`run_started_at || created_at`）
- 「今日」= `now` 的 `Asia/Shanghai` 日期 `00:00` 起
- 规则 1（最高优先）：`workflowState !== 'active'` → `needRepair = true`
- 规则 2：今日存在 `conclusion === 'success'` → 不再 dispatch、不再告警
- 规则 3：今日存在 `status` ∈ `{queued, in_progress, waiting, requested, pending}` → 等待
- 规则 4：已过 `scheduledHour + graceMin` 且今日零运行 → `needDispatch = true`
- 规则 5：`mode === 'inspect'` 且已过 `inspectHour` 且今日无成功 → `needAlert = true`

- [ ] **步骤 1：编写失败的测试**

```ts
// tests/guard/decide.test.ts
import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs 无类型声明，运行时导入
import { decide } from '../../scripts/guard/decide.mjs';

const SH = (h: number, m = 0) => new Date(`2026-11-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`);

const successRun = { status: 'completed', conclusion: 'success', when: '2026-11-10T05:03:00+08:00' };
const failRun = { status: 'completed', conclusion: 'failure', when: '2026-11-10T05:03:00+08:00' };
const runningRun = { status: 'in_progress', conclusion: null, when: '2026-11-10T05:02:00+08:00' };

describe('decide 决策', () => {
  it('工作流被停用时 needRepair 为真（最高优先级）', () => {
    const r = decide({ mode: 'preflight', now: SH(4, 45), workflowState: 'disabled_manually', runs: [successRun] });
    expect(r.needRepair).toBe(true);
    expect(r.reason).toContain('disabled_manually');
  });

  it('今日已成功：不补跑、不告警', () => {
    const r = decide({ mode: 'inspect', now: SH(12), workflowState: 'active', runs: [successRun] });
    expect(r.needDispatch).toBe(false);
    expect(r.needAlert).toBe(false);
  });

  it('今日存在运行中：等待，不干预', () => {
    const r = decide({ mode: 'preflight', now: SH(6), workflowState: 'active', runs: [runningRun] });
    expect(r.needDispatch).toBe(false);
    expect(r.reason).toContain('运行中');
  });

  it('已过计划点+宽限且今日零运行：需要补跑', () => {
    const r = decide({ mode: 'preflight', now: SH(6, 10), workflowState: 'active', runs: [] });
    expect(r.needDispatch).toBe(true);
  });

  it('未过计划点+宽限且今日零运行：不补跑（等 cron 自己跑）', () => {
    const r = decide({ mode: 'preflight', now: SH(4, 45), workflowState: 'active', runs: [] });
    expect(r.needDispatch).toBe(false);
  });

  it('工作日宽限内已过 05:00：不补跑', () => {
    const r = decide({ mode: 'preflight', now: SH(5, 30), workflowState: 'active', runs: [] });
    expect(r.needDispatch).toBe(false);
  });

  it('inspect 模式 12:00 且今日只有失败：需要告警', () => {
    const r = decide({ mode: 'inspect', now: SH(12), workflowState: 'active', runs: [failRun] });
    expect(r.needAlert).toBe(true);
    expect(r.reason).toContain('失败');
  });

  it('inspect 模式未到 12:00：不告警', () => {
    const r = decide({ mode: 'inspect', now: SH(11, 0), workflowState: 'active', runs: [failRun] });
    expect(r.needAlert).toBe(false);
  });

  it('inspect 模式今日零运行：需要告警', () => {
    const r = decide({ mode: 'inspect', now: SH(12, 1), workflowState: 'active', runs: [] });
    expect(r.needAlert).toBe(true);
    expect(r.reason).toContain('没有任何运行');
  });

  it('昨日成功不算今日成功', () => {
    const yesterday = { status: 'completed', conclusion: 'success', when: '2026-11-09T05:03:00+08:00' };
    const r = decide({ mode: 'inspect', now: SH(12), workflowState: 'active', runs: [yesterday] });
    expect(r.needAlert).toBe(true);
  });

  it('宽限期可配置：graceMin=0 时刚过 05:00 即允许补跑', () => {
    const r = decide({ mode: 'preflight', now: SH(5, 1), workflowState: 'active', runs: [], graceMin: 0 });
    expect(r.needDispatch).toBe(true);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/guard/decide.test.ts`
预期：FAIL，`Cannot find module '../../scripts/guard/decide.mjs'` 或 `decide is not a function`

- [ ] **步骤 3：编写最少实现代码**

```js
// scripts/guard/decide.mjs
// 纯函数决策层：不读时钟、不发请求，时间与数据全部由参数注入，便于 TDD 与本地复算。

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);

/** 取某时刻在 Asia/Shanghai 的「当日零点」毫秒数 */
export function shanghaiDayStart(ms) {
  const shifted = ms + SHANGHAI_OFFSET_MS;        // 平移后按 UTC 取整日
  const dayStartShifted = Math.floor(shifted / 86400000) * 86400000;
  return dayStartShifted - SHANGHAI_OFFSET_MS;
}

/** 取某时刻在 Asia/Shanghai 的「当日第几分钟」（0-1439） */
export function shanghaiMinuteOfDay(ms) {
  return Math.floor((ms + SHANGHAI_OFFSET_MS) / 60000) % 1440;
}

function runTime(run) {
  const t = new Date(run.when || '').getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {object} input
 * @param {'preflight'|'inspect'} input.mode
 * @param {Date} input.now
 * @param {string} input.workflowState      active / disabled_manually / disabled_inactivity / ...
 * @param {Array<{status:string, conclusion:string|null, when:string}>} input.runs  今日或更早都可传入
 * @param {number} [input.scheduledHour]    每日计划运行小时（上海时区）
 * @param {number} [input.graceMin]         计划点后的宽限分钟
 * @param {number} [input.inspectHour]      巡检小时
 */
export function decide({
  mode,
  now,
  workflowState,
  runs = [],
  scheduledHour = 5,
  graceMin = 60,
  inspectHour = 12,
}) {
  const nowMs = now.getTime();
  const dayStart = shanghaiDayStart(nowMs);
  const todayRuns = runs.filter((r) => {
    const t = runTime(r);
    return t >= dayStart && t < dayStart + 86400000;
  });

  const hasSuccess = todayRuns.some((r) => r.conclusion === 'success');
  const running = todayRuns.find((r) => ACTIVE_STATUSES.has(r.status));
  const failed = todayRuns.some((r) => r.conclusion === 'failure');
  const minuteOfDay = shanghaiMinuteOfDay(nowMs);

  const needRepair = workflowState !== 'active';

  if (needRepair) {
    return {
      needRepair: true,
      needDispatch: false,
      needAlert: false,
      reason: `工作流状态异常：${workflowState}，需启用`,
    };
  }

  if (hasSuccess) {
    return { needRepair: false, needDispatch: false, needAlert: false, reason: '今日已有成功运行' };
  }

  if (running) {
    return {
      needRepair: false,
      needDispatch: false,
      needAlert: false,
      reason: `今日已有运行中任务（${running.status}），等待其完成`,
    };
  }

  const pastGrace = minuteOfDay >= scheduledHour * 60 + graceMin;

  if (mode === 'preflight') {
    return {
      needRepair: false,
      needDispatch: pastGrace,
      needAlert: false,
      reason: pastGrace
        ? `已过计划点 ${scheduledHour}:00 宽限 ${graceMin} 分钟且今日无运行，需补跑`
        : `未到计划点 ${scheduledHour}:00 宽限窗口，等待定时任务`,
    };
  }

  const pastInspect = minuteOfDay >= inspectHour * 60;

  if (!pastInspect) {
    return { needRepair: false, needDispatch: false, needAlert: false, reason: `未到巡检时间 ${inspectHour}:00` };
  }

  return {
    needRepair: false,
    needDispatch: pastGrace,
    needAlert: true,
    reason: todayRuns.length === 0
      ? `${inspectHour}:00 前今日没有任何运行记录`
      : `${inspectHour}:00 前今日无成功运行${failed ? '（存在失败记录）' : ''}`,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/guard/decide.test.ts`
预期：PASS，11 passed

- [ ] **步骤 5：Commit**

```bash
git add scripts/guard/decide.mjs tests/guard/decide.test.ts
git commit -m "feat(guard): 决策纯函数 decide 与 TDD 用例"
```

---

## 任务 2：推送请求构造与四通道复刻

**文件：**
- 创建：`scripts/guard/push.mjs`
- 测试：`tests/guard/push.test.ts`

**契约（来自规格 §8）：**
- `buildPushRequest({ method, content, title, creds, maxLen })` → `{ url, init }: { url: string; init: RequestInit }` 或 `null`（未配置/未知渠道）
- `sendPush({ method, content, title, creds, maxLen, sleep })` → `{ ok, channel, detail }`，内部重试 3 次，退避 5s / 20s / 60s（`sleep` 可注入以便测试）

- [ ] **步骤 1：编写失败的测试**

```ts
// tests/guard/push.test.ts
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error — .mjs 无类型声明
import { buildPushRequest, sendPush, PUSH_RETRY_DELAYS_MS } from '../../scripts/guard/push.mjs';

const creds = {
  PUSHPLUS_TOKEN: 'pp_token',
  WXPUSHER_SPT: 'AT_abc',
  TELEGRAM_BOT_TOKEN: '123:xyz',
  TELEGRAM_CHAT_ID: '456',
  SERVERCHAN_SPT: 'SCT123',
};

describe('buildPushRequest', () => {
  it('wxpusher 走 GET，content 在 URL path 且被 encodeURIComponent', () => {
    const req = buildPushRequest({ method: 'wxpusher', content: '异常 报告', title: 'T', creds });
    expect(req.init.method).toBe('GET');
    expect(req.url).toBe('https://wxpusher.zjiecode.com/api/send/message/AT_abc/' + encodeURIComponent('异常 报告'));
  });

  it('wxpusher 超长 content 被截断到 maxLen 并加省略号', () => {
    const req = buildPushRequest({ method: 'wxpusher', content: 'x'.repeat(50), title: 'T', creds, maxLen: 10 });
    expect(req.url).toContain(encodeURIComponent('x'.repeat(10) + '…'));
    expect(req.url).not.toContain('x'.repeat(11));
  });

  it('pushplus POST，body 含 token/title/content', () => {
    const req = buildPushRequest({ method: 'pushplus', content: '正文', title: '微信阅读-异常', creds });
    expect(req.url).toBe('https://www.pushplus.plus/send');
    expect(req.init.method).toBe('POST');
    const body = JSON.parse(req.init.body as string);
    expect(body).toEqual({ token: 'pp_token', title: '微信阅读-异常', content: '正文' });
  });

  it('telegram POST，body 含 chat_id/text', () => {
    const req = buildPushRequest({ method: 'telegram', content: '正文', title: 'T', creds });
    expect(req.url).toBe('https://api.telegram.org/bot123:xyz/sendMessage');
    expect(JSON.parse(req.init.body as string)).toEqual({ chat_id: '456', text: '正文' });
  });

  it('serverchan 用 desp 字段而非 content', () => {
    const req = buildPushRequest({ method: 'serverchan', content: '正文', title: '微信阅读-异常', creds });
    expect(req.url).toBe('https://sctapi.ftqq.com/SCT123.send');
    expect(JSON.parse(req.init.body as string)).toEqual({ title: '微信阅读-异常', desp: '正文' });
  });

  it('未配置渠道返回 null', () => {
    expect(buildPushRequest({ method: '', content: 'x', title: 'T', creds })).toBeNull();
    expect(buildPushRequest({ method: 'unknown', content: 'x', title: 'T', creds })).toBeNull();
  });

  it('渠道对应凭证缺失返回 null', () => {
    expect(buildPushRequest({ method: 'wxpusher', content: 'x', title: 'T', creds: {} })).toBeNull();
    expect(buildPushRequest({ method: 'telegram', content: 'x', title: 'T', creds: { TELEGRAM_BOT_TOKEN: 'a' } })).toBeNull();
  });

  it('方法名大小写不敏感', () => {
    expect(buildPushRequest({ method: 'WXPusher', content: 'x', title: 'T', creds })).not.toBeNull();
  });
});

describe('sendPush 重试', () => {
  it('首次成功返回 ok:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('{}') });
    const res = await sendPush({ method: 'pushplus', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn() });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('失败重试 3 次后放弃，退避序列 5s/20s/60s 截取前两次', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('err') });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const res = await sendPush({ method: 'pushplus', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('500');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(PUSH_RETRY_DELAYS_MS).toEqual([5000, 20000, 60000]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5000, 20000]);
  });

  it('渠道未配置时返回 ok:false 且不发请求（不抛异常）', async () => {
    const fetchMock = vi.fn();
    const res = await sendPush({ method: '', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn() });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('未配置');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch 抛异常也纳入重试并最终返回 ok:false', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const res = await sendPush({ method: 'wxpusher', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn() });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('ECONNRESET');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/guard/push.test.ts`
预期：FAIL，模块不存在

- [ ] **步骤 3：编写最少实现代码**

```js
// scripts/guard/push.mjs
// 复刻 wxread/push.py 的四通道推送。
// 与原版的两处刻意偏离（已获确认）：
//  1. wxpusher 的 content 在 URL path 上，必须 encodeURIComponent 并截断，否则长报告会 414；
//  2. 重试由 5 次 × sleep 180~360s 改为 3 次退避 5s/20s/60s，避免占满 runner。

export const PUSH_RETRY_DELAYS_MS = [5000, 20000, 60000];
export const DEFAULT_CONTENT_MAX = 3000;

const DEFAULT_TITLE = '微信阅读-异常';

function truncate(content, maxLen) {
  const text = String(content ?? '');
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

function asSnapshot(creds) {
  return creds && typeof creds === 'object' ? creds : {};
}

/**
 * 纯函数：构造请求，不做任何 IO。
 * @returns {{ url: string, init: { method: string, headers: Record<string,string>, body?: string } } | null}
 */
export function buildPushRequest({ method, content, title, creds, maxLen = DEFAULT_CONTENT_MAX }) {
  const channel = String(method ?? '').trim().toLowerCase();
  const c = asSnapshot(creds);
  const text = truncate(content, maxLen);
  const subject = title || DEFAULT_TITLE;
  const jsonHeaders = { 'Content-Type': 'application/json' };

  if (channel === 'pushplus') {
    if (!c.PUSHPLUS_TOKEN) return null;
    return {
      url: 'https://www.pushplus.plus/send',
      init: { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ token: c.PUSHPLUS_TOKEN, title: subject, content: text }) },
    };
  }

  if (channel === 'wxpusher') {
    if (!c.WXPUSHER_SPT) return null;
    return {
      url: `https://wxpusher.zjiecode.com/api/send/message/${c.WXPUSHER_SPT}/${encodeURIComponent(text)}`,
      init: { method: 'GET', headers: {} },
    };
  }

  if (channel === 'telegram') {
    if (!c.TELEGRAM_BOT_TOKEN || !c.TELEGRAM_CHAT_ID) return null;
    return {
      url: `https://api.telegram.org/bot${c.TELEGRAM_BOT_TOKEN}/sendMessage`,
      init: { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ chat_id: c.TELEGRAM_CHAT_ID, text }) },
    };
  }

  if (channel === 'serverchan') {
    if (!c.SERVERCHAN_SPT) return null;
    return {
      url: `https://sctapi.ftqq.com/${c.SERVERCHAN_SPT}.send`,
      init: { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ title: subject, desp: text }) },
    };
  }

  return null;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 带重试的推送。
 * @returns {Promise<{ ok: boolean, channel: string, detail: string }>}
 */
export async function sendPush({
  method,
  content,
  title,
  creds,
  maxLen = DEFAULT_CONTENT_MAX,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
}) {
  const channel = String(method ?? '').trim().toLowerCase();
  const req = buildPushRequest({ method, content, title, creds, maxLen });

  if (!req) {
    const detail = channel
      ? `渠道 ${channel} 未配置或缺少凭证（支持 pushplus / wxpusher / telegram / serverchan）`
      : '未配置推送渠道（PUSH_METHOD 为空）';
    return { ok: false, channel: channel || 'none', detail };
  }

  let lastDetail = '';
  for (let attempt = 0; attempt < PUSH_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const res = await fetchImpl(req.url, { ...req.init, signal: undefined });
      const bodyText = typeof res.text === 'function' ? await res.text() : '';
      if (res.ok) return { ok: true, channel, detail: bodyText.slice(0, 200) };
      lastDetail = `HTTP ${res.status}: ${bodyText.slice(0, 200)}`;
    } catch (err) {
      lastDetail = `请求异常: ${err?.message || err}`;
    }
    const delay = PUSH_RETRY_DELAYS_MS[attempt];
    if (attempt < PUSH_RETRY_DELAYS_MS.length - 1) await sleep(delay);
  }

  return { ok: false, channel, detail: lastDetail };
}

/** 从环境变量读取凭证快照（供 main.mjs 使用） */
export function credsFromEnv(env = process.env) {
  return {
    PUSHPLUS_TOKEN: env.PUSHPLUS_TOKEN || '',
    WXPUSHER_SPT: env.WXPUSHER_SPT || '',
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID || '',
    SERVERCHAN_SPT: env.SERVERCHAN_SPT || '',
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/guard/push.test.ts`
预期：PASS，12 passed

- [ ] **步骤 5：Commit**

```bash
git add scripts/guard/push.mjs tests/guard/push.test.ts
git commit -m "feat(guard): 复刻 push.py 四通道推送（含 wxpusher 截断与退避重试）"
```

---

## 任务 3：异常报告生成

**文件：**
- 创建：`scripts/guard/report.mjs`
- 测试：`tests/guard/report.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
// tests/guard/report.test.ts
import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs 无类型声明
import { buildReport } from '../../scripts/guard/report.mjs';

const base = {
  now: new Date('2026-11-10T12:00:12+08:00'),
  owner: 'rudofski',
  repo: 'wxread',
  workflowPath: '.github/workflows/deploy.yml',
  workflowState: 'active',
  scheduledHour: 5,
  runs: [],
  actions: [],
  reason: '12:00 前今日没有任何运行记录',
  hasSuccess: false,
};

describe('buildReport', () => {
  it('包含标题、检查时间、目标仓库', () => {
    const md = buildReport(base);
    expect(md).toContain('wxread 每日运行异常报告');
    expect(md).toContain('2026-11-10 12:00');
    expect(md).toContain('rudofski/wxread');
  });

  it('零运行时不崩，并写明没有任何运行记录', () => {
    const md = buildReport(base);
    expect(md).toContain('没有任何运行');
    expect(md).toContain('共 0 条记录');
  });

  it('列出每条运行的结论与耗时', () => {
    const md = buildReport({
      ...base,
      runs: [
        { status: 'completed', conclusion: 'failure', when: '2026-11-10T05:03:00+08:00', durationSec: 252 },
        { status: 'completed', conclusion: 'cancelled', when: '2026-11-10T04:45:00+08:00', durationSec: null },
      ],
    });
    expect(md).toContain('05:03');
    expect(md).toContain('failure');
    expect(md).toContain('4分12秒');
    expect(md).toContain('cancelled');
    expect(md).toContain('共 2 条记录');
  });

  it('包含已执行动作与建议链接', () => {
    const md = buildReport({ ...base, actions: ['04:45 预检：工作流状态 active，无需启用', '05:30 复查：已触发一次补跑'] });
    expect(md).toContain('已执行的动作');
    expect(md).toContain('04:45 预检');
    expect(md).toContain('https://github.com/rudofski/wxread/actions');
  });

  it('工作流停用时显示停用状态与启用建议', () => {
    const md = buildReport({ ...base, workflowState: 'disabled_manually' });
    expect(md).toContain('disabled_manually');
    expect(md).toContain('停用');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/guard/report.test.ts`
预期：FAIL，模块不存在

- [ ] **步骤 3：编写最少实现代码**

```js
// scripts/guard/report.mjs
// 异常报告 Markdown 生成：纯函数，输入即上下文，输出可直推微信/Telegram。

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const CONCLUSION_ICON = { success: '✅', failure: '❌', cancelled: '⏭', skipped: '⏭', timed_out: '⏱' };

function formatShanghai(date) {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

function formatClock(iso) {
  const shifted = new Date(new Date(iso).getTime() + SHANGHAI_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

function formatDuration(sec) {
  if (sec == null) return '';
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
}

function describeRun(run) {
  const icon = CONCLUSION_ICON[run.conclusion] || '•';
  const verdict = run.conclusion || run.status;
  const duration = formatDuration(run.durationSec);
  return `- ${icon} ${formatClock(run.when)} ${verdict}${duration ? `，耗时 ${duration}` : ''}`;
}

export function buildReport({
  now,
  owner,
  repo,
  workflowPath,
  workflowState,
  scheduledHour = 5,
  runs = [],
  actions = [],
  reason = '',
  hasSuccess = false,
}) {
  const stateLabel = workflowState === 'active' ? 'active（正常）' : `${workflowState}（停用）`;
  const lines = [];

  lines.push('## ⚠️ wxread 每日运行异常报告', '');
  lines.push(`**检查时间**：${formatShanghai(now)}（Asia/Shanghai）`);
  lines.push(`**目标仓库**：${owner}/${repo} · ${workflowPath}`);
  lines.push(`**工作流状态**：${stateLabel}`);
  lines.push(`**今日计划运行**：${String(scheduledHour).padStart(2, '0')}:00（cron）`, '');

  lines.push(`### 今天的运行情况`);
  lines.push(`- 共 ${runs.length} 条记录`);
  if (runs.length === 0) lines.push('- 今日没有任何运行记录');
  else lines.push(...runs.map(describeRun));
  lines.push('');

  lines.push('### 判定');
  lines.push(reason ? reason : hasSuccess ? '今日已有成功运行' : '今日无成功运行');
  lines.push('');

  if (actions.length > 0) {
    lines.push('### 已执行的动作');
    lines.push(...actions.map((a) => `- ${a}`));
    lines.push('');
  }

  lines.push('### 建议');
  lines.push(`1. 打开 Actions 页面查看失败日志：https://github.com/${owner}/${repo}/actions`);
  lines.push('2. 高频原因：WXREAD_CURL_BASH 的 Cookie 过期 → 重新用 F12 复制 curl 并保存');
  if (workflowState !== 'active') {
    lines.push('3. 工作流被停用：守护自动启用失败，需到 Actions 页面手工点击 Enable workflows');
  }

  return lines.join('\n');
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/guard/report.test.ts`
预期：PASS，5 passed

- [ ] **步骤 5：Commit**

```bash
git add scripts/guard/report.mjs tests/guard/report.test.ts
git commit -m "feat(guard): 异常报告 Markdown 生成"
```

---

## 任务 4：面板侧推送状态纯函数

**文件：**
- 创建：`src/utils/pushStatus.ts`
- 测试：`tests/utils/pushStatus.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
// tests/utils/pushStatus.test.ts
import { describe, it, expect } from 'vitest';
import { evaluatePushStatus } from '@/utils/pushStatus';

describe('evaluatePushStatus', () => {
  it('远程状态未加载时为 unknown', () => {
    expect(evaluatePushStatus('wxpusher', {}).status).toBe('unknown');
  });

  it('未启用推送为 warn', () => {
    const r = evaluatePushStatus('', { WXPUSHER_SPT: true });
    expect(r.status).toBe('warn');
    expect(r.missing).toEqual([]);
  });

  it('wxpusher 凭证存在为 ok', () => {
    expect(evaluatePushStatus('wxpusher', { WXPUSHER_SPT: true }).status).toBe('ok');
  });

  it('wxpusher 凭证缺失为 error 且列出缺失项', () => {
    const r = evaluatePushStatus('wxpusher', { WXPUSHER_SPT: false, PUSH_METHOD: true });
    expect(r.status).toBe('error');
    expect(r.missing).toEqual(['WXPUSHER_SPT']);
  });

  it('pushplus 只看 PUSHPLUS_TOKEN', () => {
    expect(evaluatePushStatus('pushplus', { PUSHPLUS_TOKEN: true }).status).toBe('ok');
    expect(evaluatePushStatus('pushplus', { WXPUSHER_SPT: true }).status).toBe('error');
  });

  it('telegram 需要 token 与 chat_id 同时存在', () => {
    expect(evaluatePushStatus('telegram', { TELEGRAM_BOT_TOKEN: true, TELEGRAM_CHAT_ID: true }).status).toBe('ok');
    const r = evaluatePushStatus('telegram', { TELEGRAM_BOT_TOKEN: true, TELEGRAM_CHAT_ID: false });
    expect(r.status).toBe('error');
    expect(r.missing).toEqual(['TELEGRAM_CHAT_ID']);
  });

  it('serverchan 只看 SERVERCHAN_SPT', () => {
    expect(evaluatePushStatus('serverchan', { SERVERCHAN_SPT: true }).status).toBe('ok');
  });

  it('未知渠道为 error', () => {
    const r = evaluatePushStatus('foobar', { PUSH_METHOD: true });
    expect(r.status).toBe('error');
    expect(r.missing).toEqual(['PUSH_METHOD']);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/utils/pushStatus.test.ts`
预期：FAIL，`Failed to resolve import "@/utils/pushStatus"`

- [ ] **步骤 3：编写最少实现代码**

```ts
// src/utils/pushStatus.ts
// 推送接口状态判定（纯函数）：只做「凭证完整性」校验，不实发消息（用户确认方案 A）。
// 数据源：settings.remoteSecrets（GitHub Secrets 存在性，API 不返回明文）。

export type PushStatus = 'ok' | 'warn' | 'error' | 'unknown';

export interface PushStatusResult {
  status: PushStatus;
  /** 缺失的 Secret 名（status 为 error 时有值） */
  missing: string[];
  /** 面板直接可渲染的文案 */
  text: string;
}

const CHANNEL_REQUIREMENTS: Record<string, string[]> = {
  wxpusher: ['WXPUSHER_SPT'],
  pushplus: ['PUSHPLUS_TOKEN'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
  serverchan: ['SERVERCHAN_SPT'],
};

export function evaluatePushStatus(
  method: string,
  remoteSecrets: Record<string, boolean>,
): PushStatusResult {
  const channel = String(method ?? '').trim().toLowerCase();

  // 远程 Secrets 尚未回读（对象为空）→ 无法判定
  if (!remoteSecrets || Object.keys(remoteSecrets).length === 0) {
    return { status: 'unknown', missing: [], text: '🟡 正在检测推送接口...' };
  }

  // PUSH_METHOD 未写入远程（远端仍是旧配置或刚改还没落盘）
  if (!channel && !remoteSecrets.PUSH_METHOD) {
    return { status: 'warn', missing: [], text: '🟡 未启用推送' };
  }

  if (!channel) {
    return { status: 'warn', missing: [], text: '🟡 未启用推送' };
  }

  const required = CHANNEL_REQUIREMENTS[channel];

  if (!required) {
    return {
      status: 'error',
      missing: ['PUSH_METHOD'],
      text: '🔴 推送接口渠道未知（PUSH_METHOD 值无效）',
    };
  }

  const missing = required.filter((name) => !remoteSecrets[name]);

  if (missing.length > 0) {
    return {
      status: 'error',
      missing,
      text: `🔴 推送接口未配置完整（缺少 ${missing.join('、')}）`,
    };
  }

  const channelLabel: Record<string, string> = {
    wxpusher: 'WxPusher',
    pushplus: 'PushPlus',
    telegram: 'Telegram',
    serverchan: 'ServerChan',
  };

  return {
    status: 'ok',
    missing: [],
    text: `🟢 推送接口正常（${channelLabel[channel] || channel}）`,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/utils/pushStatus.test.ts`
预期：PASS，8 passed

- [ ] **步骤 5：Commit**

```bash
git add src/utils/pushStatus.ts tests/utils/pushStatus.test.ts
git commit -m "feat(panel): 推送接口凭证完整性判定纯函数"
```

---

## 任务 5：`getWorkflowState()` API 与 PUSH_METHOD 改写 Secret

**文件：**
- 修改：`src/api/github.ts`（在 `listWorkflows` 之后新增；修改 `wxreadAdapter.toGitHub`）
- 测试：`tests/api/workflowState.test.ts`、追加 `tests/api/github-api.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
// tests/api/workflowState.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@octokit/rest', () => {
  const mockRequest = vi.fn();
  return {
    Octokit: vi.fn().mockImplementation(() => ({ request: mockRequest, rest: { repos: { get: vi.fn() }, actions: {} } })),
    __mockRequest: mockRequest,
  };
});

import { getWorkflowState, resetOctokit } from '@/api/github';
import { __mockRequest } from '@octokit/rest';

describe('getWorkflowState', () => {
  beforeEach(() => {
    localStorage.setItem('github_token', 'ghp_test');
    resetOctokit();
    vi.clearAllMocks();
  });

  it('按 path 后缀匹配工作流并返回 state', async () => {
    __mockRequest.mockResolvedValue({
      data: { workflows: [{ id: 1, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active' }] },
    });
    const wf = await getWorkflowState('rudofski', 'wxread', 'deploy.yml');
    expect(wf).toEqual({ id: 1, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active' });
    expect(__mockRequest).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/actions/workflows', {
      owner: 'rudofski', repo: 'wxread',
    });
  });

  it('按数字 id 匹配', async () => {
    __mockRequest.mockResolvedValue({
      data: { workflows: [
        { id: 1, name: 'A', path: '.github/workflows/a.yml', state: 'disabled_manually' },
        { id: 2, name: 'B', path: '.github/workflows/b.yml', state: 'active' },
      ] },
    });
    const wf = await getWorkflowState('o', 'r', 2);
    expect(wf!.state).toBe('active');
  });

  it('未指定 pathOrId 时返回第一个工作流', async () => {
    __mockRequest.mockResolvedValue({
      data: { workflows: [{ id: 9, name: 'X', path: '.github/workflows/x.yml', state: 'active' }] },
    });
    expect((await getWorkflowState('o', 'r'))!.id).toBe(9);
  });

  it('找不到匹配返回 null', async () => {
    __mockRequest.mockResolvedValue({ data: { workflows: [{ id: 1, name: 'A', path: '.github/workflows/a.yml', state: 'active' }] } });
    expect(await getWorkflowState('o', 'r', 'missing.yml')).toBeNull();
  });

  it('工作流列表为空返回 null', async () => {
    __mockRequest.mockResolvedValue({ data: { workflows: [] } });
    expect(await getWorkflowState('o', 'r')).toBeNull();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/api/workflowState.test.ts`
预期：FAIL，`getWorkflowState` 未导出

- [ ] **步骤 3：编写最少实现代码**

在 `src/api/github.ts` 的 `listWorkflows` 之后插入：

```ts
// ============ 工作流状态（守护用） ============

export interface WorkflowState { id: number; name: string; path: string; state: string; }

/**
 * 读取工作流状态。state 取值：active / disabled_manually / disabled_inactivity / deleted。
 * pathOrId 传 'deploy.yml' 时按路径后缀匹配，传数字时按 id 匹配，省略时取第一个。
 */
export async function getWorkflowState(
  owner: string, repo: string, pathOrId?: string | number,
): Promise<WorkflowState | null> {
  const client = getOctokit();
  const resp = await client.request('GET /repos/{owner}/{repo}/actions/workflows', { owner, repo });
  const list = ((resp.data as any).workflows || []) as WorkflowState[];
  if (list.length === 0) return null;
  if (pathOrId === undefined) return { ...list[0] };
  if (typeof pathOrId === 'number') {
    const hit = list.find(w => w.id === pathOrId);
    return hit ? { ...hit } : null;
  }
  const target = pathOrId.replace(/^\.\//, '');
  const hit = list.find(w => w.path === target || w.path.endsWith('/' + target) || w.path === `.github/workflows/${target}`);
  return hit ? { ...hit } : null;
}
```

同时修改 `wxreadAdapter.toGitHub`（原第 184-188 行）：

```ts
  async toGitHub(owner: string, repo: string, settings: PanelSettings): Promise<void> {
    await updateVariable(owner, repo, 'READ_NUM', String(settings.readMinutes * 2));
    try { await updateVariable(owner, repo, 'READ_MINUTES', String(settings.readMinutes)); } catch {}
    // wxread/deploy.yml 读的是 secrets.PUSH_METHOD（不是 Variables），
    // 此前写成 Variable 导致面板里选的推送方式在 wxread 侧从未生效。
    if (settings.pushMethod) await updateSecret(owner, repo, 'PUSH_METHOD', settings.pushMethod);
  },
```

- [ ] **步骤 4：追加 PUSH_METHOD 断言并运行**

在 `tests/api/github-api.test.ts` 的 `describe('GitHub API 交互', ...)` 内追加：

```ts
  it('toGitHub 把 PUSH_METHOD 写成 Secret 而非 Variable', async () => {
    // 第一次调用：变量 PATCH；第二次：变量 PATCH(READ_MINUTES)；
    // 第三次：secret 公钥；第四次：写 secret
    __mockRequest
      .mockResolvedValueOnce({})                                       // PATCH READ_NUM
      .mockResolvedValueOnce({})                                       // PATCH READ_MINUTES
      .mockResolvedValueOnce({ data: { key: 'a2V5', key_id: 'kid1' } }) // GET public-key
      .mockResolvedValueOnce({});                                      // PUT secret
    await wxreadAdapter.toGitHub('o', 'r', {
      readMinutes: 40, pushMethod: 'wxpusher', wxpusherToken: '', curlBash: '',
    });
    const calls = __mockRequest.mock.calls.map((c) => c[0]);
    expect(calls).toContain('PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}');
    const putCall = __mockRequest.mock.calls.find((c) => c[0] === 'PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}');
    expect(putCall![1]).toEqual(expect.objectContaining({ secret_name: 'PUSH_METHOD' }));
    expect(calls).not.toContain('PATCH /repos/{owner}/{repo}/actions/variables/{name}');
  });
```

运行：`npx vitest run tests/api/workflowState.test.ts tests/api/github-api.test.ts`
预期：PASS，5 + 11 passed

- [ ] **步骤 5：Commit**

```bash
git add src/api/github.ts tests/api/workflowState.test.ts tests/api/github-api.test.ts
git commit -m "feat(panel): getWorkflowState 读取工作流状态；PUSH_METHOD 改写 Secret"
```

---

## 任务 6：settings store 接入工作流状态

**文件：**
- 修改：`src/stores/settings.ts`
- 测试：追加 `tests/stores/settings.test.ts`

- [ ] **步骤 1：编写失败的测试**

追加到 `tests/stores/settings.test.ts`：

```ts
  it('remoteSecrets 名单包含 PUSH_METHOD', async () => {
    const { remoteSecretNames } = await import('@/stores/settings');
    expect(remoteSecretNames).toContain('PUSH_METHOD');
    expect(remoteSecretNames).toContain('WXPUSHER_SPT');
  });

  it('workflowState 初始为 null', () => {
    expect(useSettingsStore().workflowState).toBeNull();
  });
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/stores/settings.test.ts`
预期：FAIL，`remoteSecretNames` 未导出 / `workflowState` 为 undefined

- [ ] **步骤 3：编写最少实现代码**

在 `src/stores/settings.ts`：

1. import 行补 `getWorkflowState, type WorkflowState`：

```ts
import { detectRepo, parseRepoUrl, wxreadAdapter, listWorkflows, secretExists, getWorkflowState, type RepoInfo, type WorkflowInfo, type WorkflowState } from '@/api/github';
```

2. 在 `const selectedWorkflowId = ref<number | string>('');` 之后新增：

```ts
  // 工作流状态：面板「Actions 工作流正常 / 已停用」状态位的数据源
  const workflowState = ref<WorkflowState | null>(null);
  const workflowStateError = ref('');
```

3. 把 `refreshSecretStatus` 里的名单提为模块级常量并补 `PUSH_METHOD`：

```ts
// 检测目标仓库中关键 Secrets 是否存在（面板状态位依赖此名单）
export const remoteSecretNames = [
  'WXREAD_CURL_BASH', 'WXPUSHER_SPT', 'PUSHPLUS_TOKEN',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'SERVERCHAN_SPT', 'PUSH_METHOD',
] as const;
```

并把函数体改为：

```ts
  async function refreshSecretStatus() {
    if (!repoInfo.value) return;
    const names = remoteSecretNames;
    const status: Record<string, boolean> = {};
    const info = repoInfo.value;
    const results = await Promise.allSettled(
      names.map(n => secretExists(info.owner, info.repo, n))
    );
    names.forEach((n, i) => { status[n] = results[i].status === 'fulfilled' ? results[i].value : false; });
    remoteSecrets.value = status;
  }
```

4. 新增工作流状态刷新函数（放在 `refreshSecretStatus` 之后）：

```ts
  // 读取 wxread 的 Actions 工作流状态（active / disabled_manually / ...）
  async function refreshWorkflowState() {
    if (!repoInfo.value) return;
    const info = repoInfo.value;
    workflowStateError.value = '';
    try {
      const wf = await getWorkflowState(info.owner, info.repo, 'deploy.yml');
      // 匹配不到 deploy.yml 时退回取第一个工作流，避免仓库改名导致状态位永久灰掉
      workflowState.value = wf ?? await getWorkflowState(info.owner, info.repo);
    } catch (e: any) {
      workflowState.value = null;
      workflowStateError.value = e?.message || String(e);
    }
  }
```

5. 在 `connectRepo` 内 `void refreshSecretStatus();` 之后补一行：

```ts
      void refreshWorkflowState();
```

6. 在 `return { ... }` 中加入 `workflowState, workflowStateError, refreshWorkflowState`。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/stores/settings.test.ts`
预期：PASS，9 passed

- [ ] **步骤 5：Commit**

```bash
git add src/stores/settings.ts tests/stores/settings.test.ts
git commit -m "feat(panel): settings store 接入工作流状态与 PUSH_METHOD 检测"
```

---

## 任务 7：RepoInput 工作流状态位

**文件：**
- 修改：`src/components/config/RepoInput.vue`

- [ ] **步骤 1：在模板中插入状态行**

在 `<select v-model="selectedWf">` 之后、`<a class="btn btn-default actions-link">` 之前插入：

```html
      <div class="status-msg" :class="wfClass">{{ wfText }}</div>
```

- [ ] **步骤 2：在 script 中补充计算属性**

```ts
// 工作流状态位：与上方「🟢 已连接 owner/repo」同款样式
const wfClass = computed(() => {
  if (settings.workflowStateError) return 'error';
  if (!settings.workflowState) return 'warn';
  return settings.workflowState.state === 'active' ? 'ok' : 'error';
});
const wfText = computed(() => {
  if (settings.workflowStateError) return `🟡 无法读取工作流状态（${settings.workflowStateError}）`;
  if (!settings.workflowState) return '🟡 正在读取工作流状态...';
  if (settings.workflowState.state === 'active') return '🟢 Actions 工作流正常';
  if (settings.workflowState.state === 'disabled_manually') return '🔴 Actions 工作流已停用（需启用）';
  if (settings.workflowState.state === 'disabled_inactivity') return '🔴 Actions 工作流因长期无活动被停用';
  return `🔴 Actions 工作流状态异常（${settings.workflowState.state}）`;
});
```

> `computed` 已在文件顶部 import，无需改动导入。

- [ ] **步骤 3：补 `.status-msg.warn` 样式**

在 `<style scoped>` 中 `.status-msg.error` 之后追加：

```css
.status-msg.warn { background: #fffbe6; color: var(--color-warning); }
```

- [ ] **步骤 4：构建验证**

运行：`npx vue-tsc --noEmit`
预期：无输出（类型检查通过）

- [ ] **步骤 5：Commit**

```bash
git add src/components/config/RepoInput.vue
git commit -m "feat(panel): 项目接口显示 Actions 工作流状态"
```

---

## 任务 8：PushConfig 推送接口状态位

**文件：**
- 修改：`src/components/config/PushConfig.vue`

- [ ] **步骤 1：在模板末尾插入状态行**

在最后一个渠道 `div` 之后（`</div>` 闭卡片之前）插入：

```html
    <div class="status-msg" :class="pushClass">{{ pushText }}</div>
```

- [ ] **步骤 2：在 script 中补充计算属性**

```ts
import { computed, ref, watch } from 'vue';
import { evaluatePushStatus } from '@/utils/pushStatus';

// 推送接口状态：只校验凭证完整性，不实发消息
const pushEval = computed(() => evaluatePushStatus(settings.pushMethod, settings.remoteSecrets));
const pushClass = computed(() => pushEval.value.status === 'ok' ? 'ok' : pushEval.value.status === 'error' ? 'error' : 'warn');
const pushText = computed(() => {
  if (pushEval.value.status === 'ok') {
    // Secrets 有分钟级传播延迟，提示用户刚保存时可能还没生效
    return settings.remoteSecrets.PUSH_METHOD ? pushEval.value.text : `${pushEval.value.text}（PUSH_METHOD 尚未同步到远程）`;
  }
  return pushEval.value.text;
});
```

- [ ] **步骤 3：补状态行样式**

在 `<style scoped>` 中追加：

```css
.status-msg { padding: 8px 12px; border-radius: 6px; margin-top: 8px; font-size: 13px; }
.status-msg.ok { background: #f6ffed; color: var(--color-success); }
.status-msg.error { background: #fff2f0; color: var(--color-danger); }
.status-msg.warn { background: #fffbe6; color: var(--color-warning); }
```

- [ ] **步骤 4：构建验证**

运行：`npx vue-tsc --noEmit`
预期：无输出

- [ ] **步骤 5：Commit**

```bash
git add src/components/config/PushConfig.vue
git commit -m "feat(panel): 推送接口显示凭证状态"
```

---

## 任务 9：REST 封装与工作流域逻辑

**文件：**
- 创建：`scripts/guard/github.mjs`
- 创建：`scripts/guard/workflow.mjs`
- 测试：`tests/guard/github.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
// tests/guard/github.test.ts
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error — .mjs 无类型声明
import { ghRequest, parseGuardEnv, classifyHttpError } from '../../scripts/guard/github.mjs';
// @ts-expect-error — .mjs 无类型声明
import { getTargetWorkflow, enableWorkflow, dispatchWorkflow, listTodayRuns } from '../../scripts/guard/workflow.mjs';

const env = {
  GH_TOKEN: 'ghp_x',
  TARGET_OWNER: 'rudofski',
  TARGET_REPO: 'wxread',
  TARGET_WORKFLOW: 'deploy.yml',
  TARGET_REF: 'main',
};

describe('parseGuardEnv', () => {
  it('读取目标仓库与默认值', () => {
    const cfg = parseGuardEnv(env);
    expect(cfg.owner).toBe('rudofski');
    expect(cfg.repo).toBe('wxread');
    expect(cfg.workflowPath).toBe('deploy.yml');
    expect(cfg.ref).toBe('main');
    expect(cfg.graceMin).toBe(60);
    expect(cfg.inspectHour).toBe(12);
  });

  it('缺 GH_TOKEN 时标记 missingToken', () => {
    expect(parseGuardEnv({}).missingToken).toBe(true);
    expect(parseGuardEnv(env).missingToken).toBe(false);
  });
});

describe('classifyHttpError', () => {
  it('403 归类为权限不足', () => {
    expect(classifyHttpError(403, 'Resource not accessible').kind).toBe('permission');
  });
  it('404 归类为不存在', () => {
    expect(classifyHttpError(404, 'Not Found').kind).toBe('not_found');
  });
  it('其它归类为 unknown 并保留原文', () => {
    const r = classifyHttpError(500, 'boom');
    expect(r.kind).toBe('unknown');
    expect(r.message).toContain('boom');
  });
});

describe('ghRequest', () => {
  it('带上 Authorization 与 API 版本头', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('{"a":1}') });
    const data = await ghRequest('GET /repos/{owner}/{repo}', {}, { token: 'ghp_x', fetchImpl: fetchMock });
    expect(data).toEqual({ a: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/{owner}/{repo}');
    expect(init.headers.Authorization).toBe('Bearer ghp_x');
    expect(init.headers['X-GitHub-Api-Version']).toBeDefined();
  });

  it('204 无 body 返回 null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') });
    expect(await ghRequest('PUT /x', {}, { token: 't', fetchImpl: fetchMock })).toBeNull();
  });

  it('非 2xx 抛带状态的错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('nope') });
    await expect(ghRequest('GET /x', {}, { token: 't', fetchImpl: fetchMock }))
      .rejects.toMatchObject({ httpStatus: 403 });
  });
});

describe('workflow 域函数', () => {
  const cfg = parseGuardEnv(env);

  it('getTargetWorkflow 按路径后缀匹配', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ workflows: [
        { id: 7, name: 'wxread', path: '.github/workflows/deploy.yml', state: 'active' },
      ] })),
    });
    const wf = await getTargetWorkflow(cfg, { fetchImpl: fetchMock });
    expect(wf.id).toBe(7);
    expect(fetchMock.mock.calls[0][0]).toContain('/actions/workflows');
  });

  it('enableWorkflow 打 PUT .../enable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') });
    await enableWorkflow(cfg, 7, { fetchImpl: fetchMock });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/rudofski/wxread/actions/workflows/7/enable');
    expect(init.method).toBe('PUT');
  });

  it('dispatchWorkflow 打 POST .../dispatches 且带 ref', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') });
    await dispatchWorkflow(cfg, 7, { fetchImpl: fetchMock });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/rudofski/wxread/actions/workflows/7/dispatches');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ref: 'main' });
  });

  it('listTodayRuns 过滤到今日并把时间归一为 when', async () => {
    const now = new Date('2026-11-10T12:00:00+08:00');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ total_count: 3, workflow_runs: [
        { id: 1, status: 'completed', conclusion: 'success', run_started_at: '2026-11-10T05:03:00Z', created_at: '2026-11-10T05:02:00Z', updated_at: '2026-11-10T05:07:00Z' },
        { id: 2, status: 'completed', conclusion: 'failure', run_started_at: '2026-11-09T05:03:00Z', created_at: '2026-11-09T05:02:00Z', updated_at: '2026-11-09T05:07:00Z' },
        { id: 3, status: 'completed', conclusion: 'failure', run_started_at: '2026-11-10T04:45:00Z', created_at: '2026-11-10T04:44:00Z', updated_at: '2026-11-10T04:50:00Z' },
      ] })),
    });
    const runs = await listTodayRuns(cfg, now, { fetchImpl: fetchMock });
    const ids = runs.map((r) => r.id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);           // 昨日，应被过滤
    expect(runs[0].when).toMatch(/\+08:00|Z/);
    expect(runs[0]).toHaveProperty('durationSec');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/guard/github.test.ts`
预期：FAIL，模块不存在

- [ ] **步骤 3：编写最少实现代码**

```js
// scripts/guard/github.mjs
// 最小 GitHub REST 封装：只用全局 fetch，零依赖（GitHub Actions Node 20 自带）。
// 刻意不引 octokit：守护脚本要能在 runner 上零安装运行。

export const API_BASE = 'https://api.github.com';
export const API_VERSION = '2022-11-28';

const INT = (v, fallback) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};

/** 环境变量 → 配置对象（缺 token 不抛，交由 main 决定退出码） */
export function parseGuardEnv(env = process.env) {
  return {
    token: env.GH_TOKEN || env.GITHUB_TOKEN || '',
    missingToken: !(env.GH_TOKEN || env.GITHUB_TOKEN),
    owner: env.TARGET_OWNER || 'rudofski',
    repo: env.TARGET_REPO || 'wxread',
    workflowPath: env.TARGET_WORKFLOW || 'deploy.yml',
    ref: env.TARGET_REF || 'main',
    guardOwner: env.GUARD_OWNER || env.GITHUB_REPOSITORY?.split('/')[0] || '',
    guardRepo: env.GUARD_REPO || env.GITHUB_REPOSITORY?.split('/')[1] || '',
    scheduledHour: INT(env.CRON_HOUR_LOCAL, 5),
    graceMin: INT(env.HOURLY_GRACE_MIN, 60),
    inspectHour: INT(env.INSPECT_HOUR_LOCAL, 12),
    pushMethod: env.PUSH_METHOD || '',
    pushContentMax: INT(env.PUSH_CONTENT_MAX, 3000),
  };
}

/** HTTP 错误归类：权限 / 不存在 / 其它 */
export function classifyHttpError(status, message) {
  const text = String(message || '');
  if (status === 401) return { kind: 'auth', message: `PAT 无效或已过期（401）：${text}` };
  if (status === 403) return { kind: 'permission', message: `PAT 权限不足（403）：${text}` };
  if (status === 404) return { kind: 'not_found', message: `资源不存在（404）：${text}` };
  return { kind: 'unknown', message: `HTTP ${status}：${text}` };
}

/** 占位符替换：支持 {owner} / {repo} / {id} 等 */
export function fillTemplate(path, params) {
  return path.replace(/\{(\w+)\}/g, (_, key) => (key in params ? String(params[key]) : `{${key}}`));
}

/**
 * 最小 REST 客户端。返回解析后的 JSON（204 返回 null）。
 * 失败抛 `Error`，并附 `httpStatus` / `kind` 字段。
 */
export async function ghRequest(path, params = {}, { token, fetchImpl = globalThis.fetch, method } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'wxread-guard',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const init = { method: method || (path.startsWith('POST') || path.startsWith('PUT') || path.startsWith('PATCH') || path.startsWith('DELETE') ? undefined : 'GET'), headers };
  if (init.method === undefined) delete init.method;

  const resp = await fetchImpl(`${API_BASE}${path}`, init);
  const raw = typeof resp.text === 'function' ? await resp.text() : '';

  if (!resp.ok) {
    const info = classifyHttpError(resp.status, raw);
    const err = new Error(info.message);
    err.httpStatus = resp.status;
    err.kind = info.kind;
    throw err;
  }

  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
```

> 注意：上面 `ghRequest` 为便于测试保留了 `path` 原样（测试断言 URL 等于 `API_BASE + path`），因此 `params` 由调用方自行拼进 path（见 `workflow.mjs`）。

```js
// scripts/guard/workflow.mjs
// 工作流域逻辑：查工作流 / 启用 / 触发 / 拉当日运行。

import { ghRequest } from './github.mjs';

const WORKFLOWS = (cfg) => `/repos/${cfg.owner}/${cfg.repo}/actions/workflows`;

function pickWorkflow(list, workflowPath) {
  const target = String(workflowPath || '').replace(/^\.\//, '');
  return (
    list.find((w) => w.path === target) ||
    list.find((w) => w.path.endsWith(`/${target}`)) ||
    list.find((w) => w.path === `.github/workflows/${target}`) ||
    list[0] ||
    null
  );
}

export async function getTargetWorkflow(cfg, io = {}) {
  const fetchImpl = io.fetchImpl || globalThis.fetch;
  const data = await ghRequest(WORKFLOWS(cfg), {}, { token: cfg.token, fetchImpl });
  const list = data?.workflows || [];
  if (list.length === 0) {
    const err = new Error('目标仓库没有任何工作流');
    err.kind = 'not_found';
    throw err;
  }
  return pickWorkflow(list, cfg.workflowPath);
}

export async function enableWorkflow(cfg, workflowId, io = {}) {
  const fetchImpl = io.fetchImpl || globalThis.fetch;
  return ghRequest(`${WORKFLOWS(cfg)}/${workflowId}/enable`, {}, { token: cfg.token, fetchImpl, method: 'PUT' });
}

export async function dispatchWorkflow(cfg, workflowId, io = {}) {
  const fetchImpl = io.fetchImpl || globalThis.fetch;
  const fn = fetchImpl;
  // dispatches 需要 POST + body：这里手工拼一次请求，复用 ghRequest 的错误归类
  const url = `${WORKFLOWS(cfg)}/${workflowId}/dispatches`;
  const resp = await fn(`https://api.github.com${url}`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'wxread-guard', Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: cfg.ref }),
  });
  const raw = typeof resp.text === 'function' ? await resp.text() : '';
  if (!resp.ok) {
    const err = new Error(`触发工作流失败（HTTP ${resp.status}）：${raw}`);
    err.httpStatus = resp.status;
    throw err;
  }
  return null;
}

/** 拉取今日（Asia/Shanghai 00:00 起）的运行，时间归一为 `when`，附耗时 */
export async function listTodayRuns(cfg, now, io = {}) {
  const fetchImpl = io.fetchImpl || globalThis.fetch;
  const url = `/repos/${cfg.owner}/${cfg.repo}/actions/runs?per_page=50`;
  const data = await ghRequest(url, {}, { token: cfg.token, fetchImpl });
  const all = data?.workflow_runs || [];

  const SHIFT = 8 * 3600 * 1000;
  const dayStart = Math.floor((now.getTime() + SHIFT) / 86400000) * 86400000 - SHIFT;

  return all
    .map((r) => {
      const started = r.run_started_at || r.created_at || '';
      const startMs = new Date(started).getTime();
      const endMs = r.updated_at ? new Date(r.updated_at).getTime() : null;
      return {
        id: r.id,
        name: r.name || '',
        status: r.status || '',
        conclusion: r.conclusion || null,
        when: started,
        startMs,
        durationSec: endMs && Number.isFinite(startMs) ? Math.max(0, Math.round((endMs - startMs) / 1000)) : null,
      };
    })
    .filter((r) => r.startMs >= dayStart && r.startMs < dayStart + 86400000)
    .sort((a, b) => b.startMs - a.startMs);
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/guard/github.test.ts`
预期：PASS，11 passed

- [ ] **步骤 5：Commit**

```bash
git add scripts/guard/github.mjs scripts/guard/workflow.mjs tests/guard/github.test.ts
git commit -m "feat(guard): GitHub REST 封装与工作流域逻辑"
```

---

## 任务 10：`GUARD_STATE` 读写

**文件：**
- 修改：`scripts/guard/github.mjs`（追加导出）
- 测试：追加 `tests/guard/github.test.ts`

- [ ] **步骤 1：编写失败的测试**

追加到 `tests/guard/github.test.ts`：

```ts
// @ts-expect-error — .mjs 无类型声明
import { readGuardState, writeGuardState, emptyGuardState } from '../../scripts/guard/github.mjs';

describe('GUARD_STATE', () => {
  const cfg = { ...parseGuardEnv(env), guardOwner: 'rudofski', guardRepo: 'wxread-panel' };

  it('emptyGuardState 给出当日空状态', () => {
    const s = emptyGuardState(new Date('2026-11-10T04:45:00+08:00'));
    expect(s.date).toBe('2026-11-10');
    expect(s.dispatchedAt).toBeNull();
    expect(s.alertedAt).toBeNull();
  });

  it('变量不存在（404）时返回当日空状态而非抛错', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('Not Found') });
    const s = await readGuardState(cfg, new Date('2026-11-10T04:45:00+08:00'), { fetchImpl: fetchMock });
    expect(s.date).toBe('2026-11-10');
  });

  it('跨日自动重置', async () => {
    const payload = { value: JSON.stringify({ date: '2026-11-09', dispatchedAt: '2026-11-09T05:30:00+08:00', alertedAt: null, lastState: 'active', lastError: '' }) };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(payload)) });
    const s = await readGuardState(cfg, new Date('2026-11-10T04:45:00+08:00'), { fetchImpl: fetchMock });
    expect(s.date).toBe('2026-11-10');
    expect(s.dispatchedAt).toBeNull();
  });

  it('writeGuardState 先 PATCH，404 时改 POST 创建', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('Not Found') })
      .mockResolvedValueOnce({ ok: true, status: 201, text: () => Promise.resolve('{}') });
    const s = emptyGuardState(new Date('2026-11-10T04:45:00+08:00'));
    const result = await writeGuardState(cfg, s, { fetchImpl: fetchMock });
    expect(result.ok).toBe(true);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(firstInit.method).toBe('PATCH');
    expect(firstUrl).toContain('/actions/variables/GUARD_STATE');
    const [secondUrl, secondInit] = fetchMock.mock.calls[1];
    expect(secondInit.method).toBe('POST');
    expect(secondUrl).toContain('/actions/variables');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/guard/github.test.ts`
预期：FAIL，`readGuardState` 未导出

- [ ] **步骤 3：编写最少实现代码**

追加到 `scripts/guard/github.mjs`：

```js
// ============ GUARD_STATE（存于守护仓库的 Actions Variables） ============
// 用途：跨 cron 轮次去重，避免 04:45 / 05:30 / 12:00 三轮重复 dispatch 或重复告警。
// 约定：仓库变量不存在时自动创建；读写失败不阻断主流程。

export const GUARD_STATE_NAME = 'GUARD_STATE';

function shanghaiDateKey(date) {
  const SHIFT = 8 * 3600 * 1000;
  const shifted = new Date(date.getTime() + SHIFT);
  const pad = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function emptyGuardState(now) {
  return { date: shanghaiDateKey(now), dispatchedAt: null, alertedAt: null, lastState: '', lastError: '' };
}

export async function readGuardState(cfg, now, io = {}) {
  const fetchImpl = io.fetchImpl || globalThis.fetch;
  const fallback = emptyGuardState(now);

  if (!cfg.guardOwner || !cfg.guardRepo) return fallback;

  try {
    const data = await ghRequest(
      `/repos/${cfg.guardOwner}/${cfg.guardRepo}/actions/variables/${GUARD_STATE_NAME}`,
      {}, { token: cfg.token, fetchImpl },
    );
    const parsed = JSON.parse(data?.value || '{}');
    if (parsed.date !== fallback.date) return fallback;   // 跨日重置
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export async function writeGuardState(cfg, state, io = {}) {
  const fetchImpl = io.fetchImpl || globalThis.fetch;
  if (!cfg.guardOwner || !cfg.guardRepo) return { ok: false, detail: '未配置守护仓库' };

  const url = `/repos/${cfg.guardOwner}/${cfg.guardRepo}/actions/variables`;
  const body = JSON.stringify({ name: GUARD_STATE_NAME, value: JSON.stringify(state) });
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'wxread-guard',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.token}`,
  };

  const patch = await fetchImpl(`https://api.github.com${url}/${GUARD_STATE_NAME}`, { method: 'PATCH', headers, body });
  if (patch.ok) return { ok: true, detail: 'updated' };

  const raw = typeof patch.text === 'function' ? await patch.text() : '';
  if (patch.status !== 404) return { ok: false, detail: `更新失败（HTTP ${patch.status}）：${raw}` };

  const created = await fetchImpl(`https://api.github.com${url}`, { method: 'POST', headers, body });
  if (created.ok) return { ok: true, detail: 'created' };
  const createRaw = typeof created.text === 'function' ? await created.text() : '';
  return { ok: false, detail: `创建失败（HTTP ${created.status}）：${createRaw}` };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/guard/github.test.ts`
预期：PASS，15 passed

- [ ] **步骤 5：Commit**

```bash
git add scripts/guard/github.mjs tests/guard/github.test.ts
git commit -m "feat(guard): GUARD_STATE 跨轮次去重（含跨日重置与自动创建）"
```

---

## 任务 11：CLI 入口 `main.mjs`

**文件：**
- 创建：`scripts/guard/main.mjs`

- [ ] **步骤 1：编写实现**

```js
#!/usr/bin/env node
// wxread 守护 CLI。
// 用法：
//   node scripts/guard/main.mjs --mode auto        # cron 默认：按当前北京时间自判
//   node scripts/guard/main.mjs --mode preflight   # 只检查 + 修复 + 补跑
//   node scripts/guard/main.mjs --mode inspect     # 只巡检 + 告警
//   node scripts/guard/main.mjs --mode all         # 两者都跑
//   node scripts/guard/main.mjs --mode check       # 只读体检（不 enable、不 dispatch、不推送）
// 退出码：0 正常 / 2 已动作但有告警 / 1 需人工处理

import { parseGuardEnv, readGuardState, writeGuardState, emptyGuardState } from './github.mjs';
import { getTargetWorkflow, enableWorkflow, dispatchWorkflow, listTodayRuns } from './workflow.mjs';
import { decide, shanghaiMinuteOfDay } from './decide.mjs';
import { buildReport } from './report.mjs';
import { sendPush, credsFromEnv } from './push.mjs';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 用固定偏移构造「看起来是本地时间」的 Date，使 decide 内部的上海换算保持一致 */
function resolveMode(requested, now) {
  if (requested && requested !== 'auto') return requested;
  const minute = shanghaiMinuteOfDay(now.getTime());
  if (minute < 11 * 60) return 'preflight';
  if (minute >= 11 * 60 + 30 && minute <= 12 * 60 + 30) return 'inspect';
  return 'all';
}

function argValue(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function runPreflight(cfg, now, state, actions) {
  const wf = await getTargetWorkflow(cfg);
  let repaired = false;
  let workflowState = wf.state;

  if (wf.state !== 'active') {
    actions.push(`${clock(now)} 预检：工作流状态 ${wf.state}，尝试启用`);
    await enableWorkflow(cfg, wf.id);
    await new Promise((r) => setTimeout(r, 2000));
    const after = await getTargetWorkflow(cfg);
    workflowState = after.state;
    if (after.state !== 'active') {
      throw Object.assign(new Error(`enable 后状态仍为 ${after.state}`), { kind: 'unknown' });
    }
    repaired = true;
    actions.push(`${clock(now)} 启用成功，状态已恢复 active`);
  } else {
    actions.push(`${clock(now)} 预检：工作流状态 active，无需启用`);
  }

  const runs = await listTodayRuns(cfg, now);
  const d = decide({
    mode: 'preflight', now, workflowState, runs,
    scheduledHour: cfg.scheduledHour, graceMin: cfg.graceMin, inspectHour: cfg.inspectHour,
  });

  let dispatched = false;
  if (d.needDispatch && !state.dispatchedAt) {
    await dispatchWorkflow(cfg, wf.id);
    dispatched = true;
    state.dispatchedAt = now.toISOString();
    actions.push(`${clock(now)} 复查：今日无运行且已过宽限，触发一次补跑（ref=${cfg.ref}）`);
  } else if (d.needDispatch && state.dispatchedAt) {
    actions.push(`${clock(now)} 复查：今日已补跑过（${state.dispatchedAt}），跳过重复触发`);
  } else {
    actions.push(`${clock(now)} 复查：${d.reason}`);
  }

  state.lastState = workflowState;
  return { repaired, dispatched, runs, decision: d, workflowState };
}

async function runInspect(cfg, now, state, actions) {
  const wf = await getTargetWorkflow(cfg);
  const runs = await listTodayRuns(cfg, now);
  const d = decide({
    mode: 'inspect', now, workflowState: wf.state, runs,
    scheduledHour: cfg.scheduledHour, graceMin: cfg.graceMin, inspectHour: cfg.inspectHour,
  });

  const hasSuccess = runs.some((r) => r.conclusion === 'success');
  let pushed = null;

  if (d.needAlert && !state.alertedAt) {
    const content = buildReport({
      now, owner: cfg.owner, repo: cfg.repo,
      workflowPath: `.github/workflows/${cfg.workflowPath}`.replace('.github/workflows/.github/workflows/', '.github/workflows/'),
      workflowState: wf.state, scheduledHour: cfg.scheduledHour,
      runs, actions, reason: d.reason, hasSuccess,
    });
    pushed = await sendPush({
      method: cfg.pushMethod, content, title: '微信阅读-异常',
      creds: credsFromEnv(), maxLen: cfg.pushContentMax,
    });
    if (pushed.ok) {
      state.alertedAt = now.toISOString();
      actions.push(`${clock(now)} 巡检：已推送异常报告（${pushed.channel}）`);
    } else {
      actions.push(`${clock(now)} 巡检：推送失败 — ${pushed.detail}`);
    }
  } else if (d.needAlert && state.alertedAt) {
    actions.push(`${clock(now)} 巡检：今日已告警过（${state.alertedAt}），跳过重复推送`);
  } else {
    actions.push(`${clock(now)} 巡检：${d.reason}`);
  }

  state.lastState = wf.state;
  return { runs, decision: d, pushed, hasSuccess, workflowState: wf.state };
}

function clock(now) {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

async function main() {
  const cfg = parseGuardEnv();
  const now = new Date();
  const requested = argValue('--mode', 'auto');
  const mode = resolveMode(requested, now);

  if (cfg.missingToken) {
    console.log('::error::缺少 WXREAD_GUARD_PAT（GH_TOKEN），无法访问 rudofski/wxread');
    console.log(JSON.stringify({ ok: false, mode, error: 'missing_token' }, null, 2));
    process.exitCode = 1;
    return;
  }

  const state = await readGuardState(cfg, now) || emptyGuardState(now);
  const actions = [];
  const result = { ok: true, mode, target: `${cfg.owner}/${cfg.repo}`, at: now.toISOString() };

  try {
    if (mode === 'check') {
      const wf = await getTargetWorkflow(cfg);
      const runs = await listTodayRuns(cfg, now);
      result.workflow = { id: wf.id, path: wf.path, state: wf.state };
      result.todayRuns = runs.length;
      result.decision = decide({
        mode: 'inspect', now, workflowState: wf.state, runs,
        scheduledHour: cfg.scheduledHour, graceMin: cfg.graceMin, inspectHour: cfg.inspectHour,
      });
    } else {
      if (mode === 'preflight' || mode === 'all') {
        result.preflight = await runPreflight(cfg, now, state, actions);
      }
      if (mode === 'inspect' || mode === 'all') {
        result.inspect = await runInspect(cfg, now, state, actions);
      }
    }

    result.actions = actions;
    await writeGuardState(cfg, state);

    const needsManual = state.lastError && !state.alertedAt;
    process.exitCode = needsManual ? 1 : actions.some((a) => a.includes('失败')) ? 2 : 0;
  } catch (err) {
    state.lastError = `${err?.kind ? `[${err.kind}] ` : ''}${err?.message || err}`;
    actions.push(`${clock(now)} 执行失败：${state.lastError}`);
    result.ok = false;
    result.actions = actions;
    result.error = state.lastError;

    // 修复失败也要通知：把失败本身当异常报告推出去
    const content = buildReport({
      now, owner: cfg.owner, repo: cfg.repo,
      workflowPath: `.github/workflows/${cfg.workflowPath}`,
      workflowState: state.lastState || 'unknown', scheduledHour: cfg.scheduledHour,
      runs: [], actions, reason: `守护执行失败：${state.lastError}`, hasSuccess: false,
    });
    const pushed = await sendPush({
      method: cfg.pushMethod, content, title: '微信阅读-异常',
      creds: credsFromEnv(), maxLen: cfg.pushContentMax,
    });
    result.push = pushed;

    await writeGuardState(cfg, state);
    console.log(`::error::${state.lastError}`);
    process.exitCode = 1;
  } finally {
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
```

- [ ] **步骤 2：本地只读冒烟**

运行：`node scripts/guard/main.mjs --mode check`
（不设 `GH_TOKEN` 时）
预期：输出 `::error::缺少 WXREAD_GUARD_PAT...` 与 JSON `{ "ok": false, "mode": "check", "error": "missing_token" }`，退出码 1

- [ ] **步骤 3：Commit**

```bash
git add scripts/guard/main.mjs
git commit -m "feat(guard): CLI 入口，串联预检/巡检与退出码语义"
```

---

## 任务 12：`guard.yml` 工作流

**文件：**
- 创建：`.github/workflows/guard.yml`

- [ ] **步骤 1：编写工作流**

```yaml
name: wxread Guard

# 目的：解决 fork 仓库的 workflows 被停用（"Workflows aren't being run on this
# forked repository"）导致定时任务静默失效的问题。
# 守护必须跑在 wxread-panel 自己这一侧：如果放在 wxread 仓库，被停用时守护自身也跑不起来。

on:
  schedule:
    - cron: '45 20 * * *'   # 04:45 北京时间：每日定时（05:00）之前预检
    - cron: '30 21 * * *'   # 05:30 北京时间：计划点后宽限复查
    - cron: '0 4 * * *'     # 12:00 北京时间：结果巡检 + 异常推送
  workflow_dispatch:
    inputs:
      mode:
        description: 'auto | preflight | inspect | all | check'
        required: false
        default: 'auto'

# 预检与巡检共用并发组，但不互相取消：
# 12:00 巡检一旦被上一轮吞掉，当天的异常报告就没了。
concurrency:
  group: wxread-guard
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  guard:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run guard
        env:
          # 需要对 rudofski/wxread 有 Actions 读写权限的 PAT（GITHUB_TOKEN 作用域仅本仓库）
          GH_TOKEN: ${{ secrets.WXREAD_GUARD_PAT }}
          TARGET_OWNER: rudofski
          TARGET_REPO: wxread
          TARGET_WORKFLOW: deploy.yml
          TARGET_REF: main
          CRON_HOUR_LOCAL: '5'
          HOURLY_GRACE_MIN: '60'
          INSPECT_HOUR_LOCAL: '12'
          PUSH_CONTENT_MAX: '3000'
          # 与 wxread 侧同名同值，保证异常报告走同一通道
          PUSH_METHOD: ${{ secrets.PUSH_METHOD }}
          PUSHPLUS_TOKEN: ${{ secrets.PUSHPLUS_TOKEN }}
          WXPUSHER_SPT: ${{ secrets.WXPUSHER_SPT }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          SERVERCHAN_SPT: ${{ secrets.SERVERCHAN_SPT }}
        run: node scripts/guard/main.mjs --mode "${{ github.event.inputs.mode || 'auto' }}"
```

- [ ] **步骤 2：YAML 语法自检**

运行：`node -e "const t=require('fs').readFileSync('.github/workflows/guard.yml','utf8'); console.log(t.includes('wxread-guard') && t.includes('WXREAD_GUARD_PAT') ? 'OK' : 'FAIL')"`
预期：`OK`

- [ ] **步骤 3：Commit**

```bash
git add .github/workflows/guard.yml
git commit -m "feat(ci): 新增 wxread 守护工作流（预检/复查/巡检）"
```

---

## 任务 13：版本号与文档

**文件：**
- 修改：`package.json` / `package-lock.json` / `deploy.sh`（经 `scripts/bump-version.mjs`）
- 修改：`README.md`

- [ ] **步骤 1：升级版本号**

运行：`node scripts/bump-version.mjs 0.2.0`
预期：三行带 ✓ 的输出，`版本已同步至 0.2.0`

- [ ] **步骤 2：README 增加守护工作流一节**

在 `## 访问密码（可选）` 之前插入：

```markdown
## 守护工作流（自动恢复 wxread 的 Actions）

fork 仓库的 workflows 默认停用（Actions 页面提示 `Workflows aren't being run on this forked repository`），
定时任务会静默失效。本项目自带 `.github/workflows/guard.yml`，无人值守地检查并修复：

| 时间（北京时间） | 动作 |
|---|---|
| 04:45 | 预检：工作流非 `active` 时调用 enable 接口启用，并复核状态 |
| 05:30 | 复查：已过 05:00 宽限仍无运行 → 触发一次 `workflow_dispatch` 补跑 |
| 12:00 | 巡检：当天 00:00–12:00 无成功运行 → 推送异常报告（复刻 wxread 的 `push.py`） |

### 一次性配置

`Settings → Secrets and variables → Actions` 添加：

| Secret | 说明 |
|---|---|
| `WXREAD_GUARD_PAT` | 经典 PAT，勾选 `repo`（需能访问 `rudofski/wxread`）；Fine-grained 则需 Actions: read/write + Contents: read |
| `PUSH_METHOD` | 与 wxread 侧一致：`wxpusher` / `pushplus` / `telegram` / `serverchan` |
| `PUSHPLUS_TOKEN`、`WXPUSHER_SPT`、`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`、`SERVERCHAN_SPT` | 与 wxread 侧同值，异常报告走同一通道 |

守护状态存在本仓库 Actions Variable `GUARD_STATE`（按日去重，避免重复补跑/重复告警）。

本地只读体检：`node scripts/guard/main.mjs --mode check`（不需要 token 也能验证缺配置的提示）。
```

- [ ] **步骤 3：全量测试 + 构建**

运行：`npx vitest run && npm run build`
预期：所有测试 PASS；`vue-tsc --noEmit` 无输出；`vite build` 成功产出 `dist/`

- [ ] **步骤 4：Commit**

```bash
git add package.json package-lock.json deploy.sh README.md
git commit -m "docs: 守护工作流说明；版本升至 0.2.0"
```

---

## 自检清单

**规格覆盖度**

| 规格条目 | 对应任务 |
|---|---|
| G1 项目接口显示工作流状态 | 任务 5（API）、6（store）、7（UI） |
| G2 每日定时前自动检查并自动重启 | 任务 1（决策）、9（enable/dispatch）、11（预检）、12（04:45 cron） |
| G3 推送接口显示状态 | 任务 4（纯函数）、8（UI） |
| G4 12:00 巡检 + 异常推送 | 任务 2（推送）、3（报告）、11（巡检）、12（12:00 cron） |
| §7.3 修复链路 enable → 复核 → dispatch | 任务 11 `runPreflight` |
| §9 GUARD_STATE 去重 | 任务 10、11 |
| §10.5 PUSH_METHOD 改写 Secret | 任务 5 |
| §12 退出码语义 | 任务 11 |
| §14 用户手工前置条件 | 任务 13 README |
| G5 本地验证后再推送 | 任务 13 步骤 3，及阶段 7 收尾 |

**类型一致性**：`decide()` 参数 `now / workflowState / runs / scheduledHour / graceMin / inspectHour` 在任务 1、9、11 中一致；`runs[].when` 在任务 1、3、9 中一致；`sendPush()` 的 `{ ok, channel, detail }` 在任务 2、11 中一致；`evaluatePushStatus()` 的 `{ status, missing, text }` 在任务 4、8 中一致。
