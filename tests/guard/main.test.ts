import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error — .mjs 无类型声明
import { main } from '../../scripts/guard/main.mjs';

// 端到端：只替换 globalThis.fetch，其余全走真实代码路径（decide / state / report / push / workflow）。
// 目的是把「04:45 停用 → enable → 05:30 补跑 → 12:00 告警」这条链路钉死在测试里，
// 而不是靠人眼读 main.mjs。
const OWNER = 'rudofski';
const REPO = 'wxread';

function makeFetch(handler: (url: string, init: any) => any) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string, init: any) => {
    calls.push(`${init?.method || 'GET'} ${url}`);
    const r = handler(String(url), init);
    const body = r.body ?? '';
    return { ok: r.ok ?? true, status: r.status ?? 200, text: async () => body, json: async () => JSON.parse(body) };
  });
  return { impl, calls };
}

function workflowsBody(state: string) {
  return JSON.stringify({
    workflows: [{ id: 235172077, name: 'wxread', path: '.github/workflows/deploy.yml', state }],
  });
}

function runsBody(runs: any[]) {
  return JSON.stringify({ workflow_runs: runs });
}

const env = (extra: Record<string, string> = {}) => ({
  WXREAD_GUARD_PAT: 'pat_test',
  WXREAD_REPO: `${OWNER}/${REPO}`,
  PUSH_METHOD: 'pushplus',
  PUSHPLUS_TOKEN: 'tok',
  ...extra,
});

// 端到端只关心决策与请求序列，等待时间全部折叠为 0
const FAST = {
  sleep: vi.fn().mockResolvedValue(undefined),
  pushSleep: vi.fn().mockResolvedValue(undefined),
  recheckDelays: [0, 0, 0],
};

let savedArgv: string[];
let savedEnv: NodeJS.ProcessEnv;
let savedFetch: any;

beforeEach(() => {
  savedArgv = process.argv;
  savedEnv = { ...process.env };
  savedFetch = globalThis.fetch;
});

afterEach(() => {
  process.argv = savedArgv;
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  globalThis.fetch = savedFetch;
});

function setEnv(extra: Record<string, string>) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('WXREAD_') || k.startsWith('PUSH') || k.startsWith('WXPUSHER') || k.startsWith('TELEGRAM') || k.startsWith('SERVERCHAN')) {
      delete process.env[k];
    }
  }
  Object.assign(process.env, extra);
}

describe('main() 端到端', () => {
  it('工作流被停用：enable → 复核 active → 今日零运行则补跑', async () => {
    setEnv(env());
    process.argv = ['node', 'main.mjs', '--mode', 'all'];
    let state = 'disabled_manually';
    const { impl, calls } = makeFetch((url) => {
      if (url.endsWith('/actions/workflows')) return { body: workflowsBody(state) };
      if (url.includes('/enable')) { state = 'active'; return { status: 204 }; }
      if (url.includes('/variables/GUARD_STATE')) return { status: 404 };
      if (url.includes('/actions/variables')) return { status: 204 };
      if (url.includes('/runs')) return { body: runsBody([]) };
      if (url.includes('/dispatches')) return { status: 204 };
      if (url.includes('pushplus')) return { body: '{"code":200}' };
      return { body: '{}' };
    });
    globalThis.fetch = impl;

    const code = await main(FAST);

    expect(calls.some((c) => c.startsWith('PUT') && c.includes('/enable'))).toBe(true);
    expect(calls.some((c) => c.startsWith('POST') && c.includes('/dispatches'))).toBe(true);
    expect(code).toBe(0);
  });

  it('enable 未被接受（复核仍停用）：退出码 2 且必须推送告警', async () => {
    setEnv(env());
    process.argv = ['node', 'main.mjs', '--mode', 'inspect'];
    const { impl, calls } = makeFetch((url) => {
      if (url.endsWith('/actions/workflows')) return { body: workflowsBody('disabled_manually') };
      if (url.includes('/enable')) return { status: 204 };
      if (url.includes('/variables/GUARD_STATE')) return { status: 404 };
      if (url.includes('/actions/variables')) return { status: 204 };
      if (url.includes('/runs')) return { body: runsBody([]) };
      if (url.includes('pushplus')) return { body: '{"code":200}' };
      return { body: '{}' };
    });
    globalThis.fetch = impl;

    expect(await main(FAST)).toBe(2);
    expect(calls.some((c) => c.includes('pushplus'))).toBe(true);
  });

  it('今日已成功运行：不补跑、不告警、退出码 0', async () => {
    setEnv(env());
    process.argv = ['node', 'main.mjs', '--mode', 'all'];
    const today = new Date(Date.now() - 3600 * 1000).toISOString();
    const { impl, calls } = makeFetch((url) => {
      if (url.endsWith('/actions/workflows')) return { body: workflowsBody('active') };
      if (url.includes('/variables/GUARD_STATE')) return { status: 404 };
      if (url.includes('/actions/variables')) return { status: 204 };
      if (url.includes('/runs')) {
        return { body: runsBody([{ id: 1, status: 'completed', conclusion: 'success', run_started_at: today, updated_at: today }]) };
      }
      if (url.includes('pushplus')) return { body: '{"code":200}' };
      return { body: '{}' };
    });
    globalThis.fetch = impl;

    const code = await main(FAST);

    expect(calls.some((c) => c.includes('/dispatches'))).toBe(false);
    expect(calls.some((c) => c.includes('pushplus'))).toBe(false);
    expect(code).toBe(0);
  });

  it('推送业务码失败时退出码 2（job 变红兜底）', async () => {
    setEnv(env());
    process.argv = ['node', 'main.mjs', '--mode', 'inspect'];
    const { impl } = makeFetch((url) => {
      if (url.endsWith('/actions/workflows')) return { body: workflowsBody('active') };
      if (url.includes('/variables/GUARD_STATE')) return { status: 404 };
      if (url.includes('/actions/variables')) return { status: 204 };
      if (url.includes('/runs')) return { body: runsBody([]) };
      if (url.includes('pushplus')) return { body: '{"code":900,"msg":"bad token"}' };
      return { body: '{}' };
    });
    globalThis.fetch = impl;

    expect(await main(FAST)).toBe(2);
  });

  it('--mode check 只读：不发 enable、不 dispatch、不写状态', async () => {
    setEnv(env());
    process.argv = ['node', 'main.mjs', '--mode', 'check'];
    const { impl, calls } = makeFetch((url) => {
      if (url.endsWith('/actions/workflows')) return { body: workflowsBody('disabled_manually') };
      if (url.includes('/runs')) return { body: runsBody([]) };
      return { body: '{}' };
    });
    globalThis.fetch = impl;

    const code = await main(FAST);

    expect(code).toBe(2); // 停用状态：体检结论就是「需要人工」
    expect(calls.every((c) => c.startsWith('GET'))).toBe(true);
  });

  it('缺少 PAT 时直接返回 1，不发任何请求', async () => {
    setEnv({ WXREAD_REPO: `${OWNER}/${REPO}` });
    process.argv = ['node', 'main.mjs', '--mode', 'check'];
    const { impl, calls } = makeFetch(() => ({ body: '{}' }));
    globalThis.fetch = impl;

    expect(await main(FAST)).toBe(1);
    expect(calls.length).toBe(0);
  });
});
