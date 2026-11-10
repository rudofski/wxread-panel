import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@octokit/rest', () => {
  const mockRequest = vi.fn();
  return {
    Octokit: vi.fn().mockImplementation(() => ({
      request: mockRequest,
      rest: { repos: { get: vi.fn() }, actions: {} },
    })),
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
      owner: 'rudofski',
      repo: 'wxread',
    });
  });

  it('按数字 id 匹配', async () => {
    __mockRequest.mockResolvedValue({
      data: {
        workflows: [
          { id: 1, name: 'A', path: '.github/workflows/a.yml', state: 'disabled_manually' },
          { id: 2, name: 'B', path: '.github/workflows/b.yml', state: 'active' },
        ],
      },
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
    __mockRequest.mockResolvedValue({
      data: { workflows: [{ id: 1, name: 'A', path: '.github/workflows/a.yml', state: 'active' }] },
    });
    expect(await getWorkflowState('o', 'r', 'missing.yml')).toBeNull();
  });

  it('工作流列表为空返回 null', async () => {
    __mockRequest.mockResolvedValue({ data: { workflows: [] } });
    expect(await getWorkflowState('o', 'r')).toBeNull();
  });
});
