import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@octokit/rest', () => {
  const mockRequest = vi.fn();
  const mockReposGet = vi.fn();
  const mockCreateDispatch = vi.fn();
  const mockListRuns = vi.fn();
  const mockListJobs = vi.fn();
  return {
    Octokit: vi.fn().mockImplementation(() => ({
      request: mockRequest,
      rest: {
        repos: { get: mockReposGet },
        actions: {
          createWorkflowDispatch: mockCreateDispatch,
          listWorkflowRuns: mockListRuns,
          listJobsForWorkflowRun: mockListJobs,
        },
      },
    })),
    __mockRequest: mockRequest,
    __mockReposGet: mockReposGet,
    __mockCreateDispatch: mockCreateDispatch,
    __mockListRuns: mockListRuns,
    __mockListJobs: mockListJobs,
  };
});

import {
  detectRepo,
  updateVariable,
  dispatchWorkflow,
  wxreadAdapter,
  resetOctokit,
  getRunLogs,
} from '@/api/github';
import { __mockRequest, __mockReposGet, __mockCreateDispatch, __mockListRuns, __mockListJobs } from '@octokit/rest';

describe('GitHub API 交互', () => {
  beforeEach(() => {
    localStorage.setItem('github_token', 'ghp_testtoken');
    resetOctokit();
    vi.clearAllMocks();
  });

  it('detectRepo 有效仓库返回 ok', async () => {
    __mockReposGet.mockResolvedValue({ data: { full_name: 'rudofski/wxread' } });
    const result = await detectRepo('https://github.com/rudofski/wxread');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('rudofski/wxread');
    expect(__mockReposGet).toHaveBeenCalledWith({ owner: 'rudofski', repo: 'wxread' });
  });

  it('detectRepo 404 返回仓库不存在', async () => {
    const err: any = new Error('Not Found');
    err.status = 404;
    __mockReposGet.mockRejectedValue(err);
    const result = await detectRepo('https://github.com/nobody/no-repo');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('仓库不存在');
  });

  it('updateVariable 变量不存在时走创建（404 → POST）', async () => {
    const err: any = new Error('Not Found');
    err.status = 404;
    __mockRequest.mockRejectedValueOnce(err).mockResolvedValueOnce({});
    await updateVariable('o', 'r', 'READ_NUM', '80');
    expect(__mockRequest).toHaveBeenNthCalledWith(1, 'PATCH /repos/{owner}/{repo}/actions/variables/{name}', {
      owner: 'o', repo: 'r', name: 'READ_NUM', value: '80',
    });
    expect(__mockRequest).toHaveBeenNthCalledWith(2, 'POST /repos/{owner}/{repo}/actions/variables', {
      owner: 'o', repo: 'r', name: 'READ_NUM', value: '80',
    });
  });

  it('dispatchWorkflow 传入正确的 owner/repo/workflow_id/ref', async () => {
    __mockCreateDispatch.mockResolvedValue({});
    await dispatchWorkflow('rudofski', 'wxread', 12345);
    expect(__mockCreateDispatch).toHaveBeenCalledWith({
      owner: 'rudofski', repo: 'wxread', workflow_id: 12345, ref: 'main',
    });
  });

  it('wxreadAdapter.fromGitHub 按 READ_NUM 换算分钟（÷2）', async () => {
    __mockRequest.mockResolvedValue({
      data: { variables: [{ name: 'READ_NUM', value: '80' }, { name: 'PUSH_METHOD', value: 'wxpusher' }] },
    });
    const s = await wxreadAdapter.fromGitHub('o', 'r');
    expect(s.readMinutes).toBe(40);
    expect(s.pushMethod).toBe('wxpusher');
  });

  it('wxreadAdapter.fromGitHub 优先 READ_MINUTES 新格式', async () => {
    __mockRequest.mockResolvedValue({
      data: { variables: [{ name: 'READ_MINUTES', value: '60' }, { name: 'READ_NUM', value: '120' }] },
    });
    const s = await wxreadAdapter.fromGitHub('o', 'r');
    expect(s.readMinutes).toBe(60);
  });

  it('getRunLogs 拉取第一个 job 的纯文本日志', async () => {
    __mockListJobs.mockResolvedValue({ data: { jobs: [{ id: 99 }] } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('Error: Cookie expired') });
    vi.stubGlobal('fetch', fetchMock);
    const logs = await getRunLogs('o', 'r', 7);
    expect(logs).toContain('Cookie expired');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/o/r/actions/jobs/99/logs',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer ghp_testtoken' }) }),
    );
    vi.unstubAllGlobals();
  });
});
