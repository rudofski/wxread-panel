// 工作流层面的三个动作：读状态、启用、补跑，以及读运行历史。
import { ghRequest } from './github.mjs';

const RUNS_PER_PAGE = 30;

/** 按 workflowPath（如 deploy.yml）选中目标工作流；找不到返回 null */
export async function getTargetWorkflow(cfg, { fetchImpl } = {}) {
  const data = await ghRequest(
    '/repos/{owner}/{repo}/actions/workflows',
    { owner: cfg.owner, repo: cfg.repo },
    { token: cfg.token, fetchImpl },
  );
  const list = data?.workflows || [];
  if (list.length === 0) return null;

  const target = String(cfg.workflowPath || '').replace(/^\.\//, '');
  const hit =
    list.find((w) => w.path === target) ||
    list.find((w) => w.path?.endsWith('/' + target)) ||
    list.find((w) => w.path === `.github/workflows/${target}`) ||
    (target ? null : list[0]);

  return hit ? { id: hit.id, name: hit.name, path: hit.path, state: hit.state } : null;
}

/** 重新启用被停用的工作流（对应网页上的 "I understand my workflows, go ahead and enable them"） */
export async function enableWorkflow(cfg, workflowId, { fetchImpl } = {}) {
  await ghRequest(
    '/repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable',
    { owner: cfg.owner, repo: cfg.repo, workflow_id: workflowId },
    { token: cfg.token, fetchImpl, method: 'PUT' },
  );
}

/** 手动触发 workflow_dispatch */
export async function dispatchWorkflow(cfg, workflowId, { fetchImpl } = {}) {
  await ghRequest(
    '/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
    { owner: cfg.owner, repo: cfg.repo, workflow_id: workflowId },
    { token: cfg.token, fetchImpl, method: 'POST', body: { ref: cfg.ref || 'main' } },
  );
}

/** 最近一批运行记录（按创建时间倒序），映射成 decide 需要的形状 */
export async function listTodayRuns(cfg, { fetchImpl } = {}) {
  const data = await ghRequest(
    '/repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
    { owner: cfg.owner, repo: cfg.repo, workflow_id: cfg.workflowId },
    { token: cfg.token, fetchImpl },
  );
  return (data?.workflow_runs || []).slice(0, RUNS_PER_PAGE).map((r) => {
    const started = r.run_started_at || r.created_at;
    const startMs = new Date(started).getTime();
    const endMs = r.status === 'completed' ? new Date(r.updated_at).getTime() : NaN;
    const durationSec =
      Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 1000)) : null;
    return {
      id: r.id,
      status: r.status,
      conclusion: r.conclusion ?? null,
      when: started,
      durationSec,
    };
  });
}
