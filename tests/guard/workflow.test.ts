import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error — .mjs 无类型声明
import { parseGuardEnv, classifyHttpError, fillTemplate, ghRequest, API_VERSION } from '../../scripts/guard/github.mjs';
// @ts-expect-error — .mjs 无类型声明
import { getTargetWorkflow, enableWorkflow, dispatchWorkflow, listTodayRuns } from '../../scripts/guard/workflow.mjs';

describe('parseGuardEnv', () => {
  it('解析必填与可选变量，仓库地址支持 owner/repo 与完整 URL', () => {
    const cfg = parseGuardEnv({
      WXREAD_GUARD_PAT: 'pat_1',
      WXREAD_REPO: 'https://github.com/rudofski/wxread',
      WXREAD_WORKFLOW: 'deploy.yml',
      WXREAD_REF: 'main',
    });
    expect(cfg.token).toBe('pat_1');
    expect(cfg.owner).toBe('rudofski');
    expect(cfg.repo).toBe('wxread');
    expect(cfg.workflowPath).toBe('deploy.yml');
    expect(cfg.ref).toBe('main');
  });

  it('WXREAD_REPO 写成 owner/repo 也能解析', () => {
    const cfg = parseGuardEnv({ WXREAD_GUARD_PAT: 'p', WXREAD_REPO: 'a/b' });
    expect(cfg.owner).toBe('a');
    expect(cfg.repo).toBe('b');
  });

  it('缺 token 或 repo 时抛错', () => {
    expect(() => parseGuardEnv({ WXREAD_REPO: 'a/b' })).toThrow();
    expect(() => parseGuardEnv({ WXREAD_GUARD_PAT: 'p' })).toThrow();
  });

  it('默认值：workflowPath=deploy.yml、ref=main、scheduledHour=5', () => {
    const cfg = parseGuardEnv({ WXREAD_GUARD_PAT: 'p', WXREAD_REPO: 'a/b' });
    expect(cfg.workflowPath).toBe('deploy.yml');
    expect(cfg.ref).toBe('main');
    expect(cfg.scheduledHour).toBe(5);
  });
});

describe('classifyHttpError', () => {
  it('401/403 归为权限问题并给出 PAT 提示', () => {
    expect(classifyHttpError(401, 'Bad credentials')).toContain('PAT');
    expect(classifyHttpError(403, 'Resource not accessible')).toContain('PAT');
  });

  it('404 归为找不到工作流', () => {
    expect(classifyHttpError(404, 'Not Found')).toContain('不存在');
  });

  it('5xx 归为 GitHub 侧故障', () => {
    expect(classifyHttpError(503, 'unavailable')).toContain('GitHub');
  });

  it('未知状态码保留原文', () => {
    expect(classifyHttpError(418, 'teapot')).toContain('418');
  });
});

describe('fillTemplate', () => {
  it('替换 {owner}/{repo} 占位符', () => {
    expect(fillTemplate('/repos/{owner}/{repo}/actions/workflows', { owner: 'o', repo: 'r' })).toBe(
      '/repos/o/r/actions/workflows',
    );
  });

  it('缺失变量保留原样，不抛错', () => {
    expect(fillTemplate('/repos/{owner}/{repo}/x', { owner: 'o' })).toBe('/repos/o/{repo}/x');
  });
});

describe('ghRequest', () => {
  it('带 Bearer token 与 X-GitHub-Api-Version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: () => Promise.resolve('{"a":1}'),
    });
    const data = await ghRequest('/repos/{owner}/{repo}/actions/workflows', { owner: 'o', repo: 'r' }, {
      token: 'pat_x', fetchImpl,
    });
    expect(data).toEqual({ a: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/o/r/actions/workflows');
    expect(init.headers.Authorization).toBe('Bearer pat_x');
    expect(init.headers['X-GitHub-Api-Version']).toBe(API_VERSION);
  });

  it('非 2xx 抛出带状态的错误对象', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('Not Found') });
    await expect(
      ghRequest('/repos/{owner}/{repo}/actions/workflows/{id}', { owner: 'o', repo: 'r', id: 1 }, { timeoutToken: 1, token: 't', fetchImpl } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('method=POST 时带 body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') });
    await ghRequest('/repos/{owner}/{repo}/actions/workflows/{id}/enable', { owner: 'o', repo: 'r', id: 7 }, {
      token: 't', fetchImpl, method: 'PUT',
    });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('PUT');
  });
});

describe('workflow 模块', () => {
  const cfg = { owner: 'rudofski', repo: 'wxread', workflowPath: 'deploy.yml', ref: 'main', token: 'pat' };

  it('getTargetWorkflow 按 path 后缀选中 deploy.yml', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ workflows: [
        { id: 1, name: 'other', path: '.github/workflows/other.yml', state: 'active' },
        { id: 235172077, name: 'wxread', path: '.github/workflows/deploy.yml', state: 'disabled_manually' },
      ] })),
    });
    const wf = await getTargetWorkflow(cfg, { fetchImpl });
    expect(wf.id).toBe(235172077);
    expect(wf.state).toBe('disabled_manually');
  });

  it('getTargetWorkflow 找不到目标时返回 null', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: () => Promise.resolve('{"workflows":[]}'),
    });
    expect(await getTargetWorkflow(cfg, { fetchImpl })).toBeNull();
  });

  it('enableWorkflow 打 PUT .../enable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') });
    await enableWorkflow(cfg, 235172077, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toContain('/actions/workflows/235172077/enable');
    expect(fetchImpl.mock.calls[0][1].method).toBe('PUT');
  });

  it('dispatchWorkflow 打 POST .../dispatches 且带 ref', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') });
    await dispatchWorkflow(cfg, 235172077, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/actions/workflows/235172077/dispatches');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ref: 'main' });
  });

  it('listTodayRuns 按 workflow 过滤并映射耗时', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ workflow_runs: [
        { id: 11, status: 'completed', conclusion: 'success', run_started_at: '2026-11-10T05:02:00Z',
          created_at: '2026-11-10T05:01:00Z', updated_at: '2026-11-10T05:05:12Z' },
        { id: 12, status: 'in_progress', conclusion: null, run_started_at: null,
          created_at: '2026-11-10T04:45:00Z', updated_at: '2026-11-10T04:46:00Z' },
      ] })),
    });
    const runs = await listTodayRuns(cfg, { fetchImpl });
    expect(runs).toHaveLength(2);
    expect(runs[0].when).toBe('2026-11-10T05:02:00Z');
    expect(runs[0].durationSec).toBe(192);
    expect(runs[1].when).toBe('2026-11-10T04:45:00Z');
    expect(runs[1].durationSec).toBeNull();
  });
});
