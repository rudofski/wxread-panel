import { Octokit } from '@octokit/rest';
import { sealedBoxEncryptToBase64 } from '@/utils/sealedBox';

let octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!octokit) {
    const token = localStorage.getItem('github_token');
    if (!token) throw new Error('未登录');
    octokit = new Octokit({ auth: token });
  }
  return octokit;
}

export function resetOctokit(): void { octokit = null; }

// ============ 仓库检测 ============

export interface RepoInfo { owner: string; repo: string; fullName: string; }

export function parseRepoUrl(url: string): RepoInfo | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\/$/, ''), fullName: `${match[1]}/${match[2]}` };
}

export async function detectRepo(url: string): Promise<{ ok: boolean; message: string }> {
  const info = parseRepoUrl(url);
  if (!info) return { ok: false, message: '无效的 GitHub 仓库地址' };
  const client = getOctokit();
  try {
    const resp = await client.rest.repos.get({ owner: info.owner, repo: info.repo });
    return { ok: true, message: `已连接 ${resp.data.full_name}` };
  } catch (e: any) {
    if (e.status === 404) return { ok: false, message: '仓库不存在' };
    if (e.status === 403) return { ok: false, message: '无权限访问' };
    return { ok: false, message: `连接失败：${e.message}` };
  }
}

// ============ Variables 读写 ============

export async function getVariables(owner: string, repo: string): Promise<Record<string, string>> {
  const client = getOctokit();
  const result: Record<string, string> = {};
  try {
    const resp = await client.request('GET /repos/{owner}/{repo}/actions/variables', { owner, repo });
    for (const v of (resp.data as any).variables || []) result[v.name] = v.value;
  } catch (e: any) { console.error('读取 Variables 失败:', e.message); }
  return result;
}

export async function updateVariable(owner: string, repo: string, name: string, value: string): Promise<void> {
  const client = getOctokit();
  try {
    await client.request('PATCH /repos/{owner}/{repo}/actions/variables/{name}', { owner, repo, name, value });
  } catch (e: any) {
    if (e.status === 404) {
      await client.request('POST /repos/{owner}/{repo}/actions/variables', { owner, repo, name, value });
    } else { throw e; }
  }
}

// ============ Secrets 写入 ============

export async function updateSecret(owner: string, repo: string, name: string, value: string): Promise<void> {
  const client = getOctokit();
  const { data: pubKey } = await client.request('GET /repos/{owner}/{repo}/actions/secrets/public-key', { owner, repo });
  // GitHub Secrets 使用 libsodium sealed box（curve25519）加密，而非 RSA
  const encryptedValue = sealedBoxEncryptToBase64(new TextEncoder().encode(value), pubKey.key);
  await client.request('PUT /repos/{owner}/{repo}/actions/secrets/{secret_name}', {
    owner, repo, secret_name: name, encrypted_value: encryptedValue, key_id: pubKey.key_id,
  });
}

// ============ Workflows ============

export interface WorkflowInfo { id: number; name: string; path: string; }

export async function listWorkflows(owner: string, repo: string): Promise<WorkflowInfo[]> {
  const client = getOctokit();
  const resp = await client.rest.actions.listRepoWorkflows({ owner, repo });
  return (resp.data.workflows || []).map(w => ({ id: w.id, name: w.name || w.path, path: w.path }));
}

export async function dispatchWorkflow(owner: string, repo: string, workflowId: string | number, ref: string = 'main'): Promise<void> {
  const client = getOctokit();
  await client.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: workflowId as any, ref });
}

export interface RunInfo {
  id: number; name: string; status: string; conclusion: string | null;
  created_at: string; updated_at: string; run_started_at: string | null;
}

export async function listWorkflowRuns(owner: string, repo: string, workflowId: string | number, perPage: number = 50): Promise<RunInfo[]> {
  const client = getOctokit();
  const resp = await client.rest.actions.listWorkflowRuns({ owner, repo, workflow_id: workflowId as any, per_page: perPage });
  return (resp.data.workflow_runs || []).map(r => ({
    id: r.id, name: r.name || '', status: r.status || '', conclusion: r.conclusion || null,
    created_at: r.created_at, updated_at: r.updated_at, run_started_at: r.run_started_at ?? null,
  }));
}

export async function getRunLogs(owner: string, repo: string, runId: number): Promise<string> {
  const client = getOctokit();
  const resp = await client.rest.actions.downloadWorkflowRunLogs({ owner, repo, run_id: runId });
  return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
}

// ============ 日志解析 ============

export function parseRunError(logs: string): string | null {
  const patterns: { regex: RegExp; message: string }[] = [
    { regex: /Cookie.*expired|401.*Unauthorized|wr_vid.*invalid/i, message: 'Cookie 已过期，请重新登录微信读书' },
    { regex: /WxPusher.*fail|推送.*失败|push.*error/i, message: '推送失败，请检查 WXPUSHER_SPT 是否有效' },
    { regex: /timeout|timed out|连接超时/i, message: '微信读书接口响应超时，请稍后重试' },
    { regex: /rate.limit|too many requests/i, message: '请求过于频繁，请稍后重试' },
    { regex: /CURL_BASH.*empty|CURL_BASH.*未配置/i, message: '未配置 curl_bash，请在配置页设置登录方式' },
  ];
  for (const { regex, message } of patterns) {
    if (regex.test(logs)) return message;
  }
  return null;
}

// ============ 适配层 ============

export interface PanelSettings {
  readMinutes: number; pushMethod: string; wxpusherToken: string; curlBash: string; selectedBooks: string[];
}

export const wxreadAdapter = {
  async fromGitHub(owner: string, repo: string): Promise<PanelSettings> {
    const vars = await getVariables(owner, repo);
    const rawReadNum = vars.READ_NUM || vars.READ_MINUTES || '40';
    let readMinutes: number;
    if (vars.READ_MINUTES) { readMinutes = parseInt(vars.READ_MINUTES); }
    else { readMinutes = Math.round(parseInt(rawReadNum) / 2); }
    return {
      readMinutes,
      pushMethod: vars.PUSH_METHOD || '',
      wxpusherToken: '',
      curlBash: '',
      selectedBooks: (vars.SELECTED_BOOKS || '').split(',').map(s => s.trim()).filter(Boolean),
    };
  },

  async toGitHub(owner: string, repo: string, settings: PanelSettings): Promise<void> {
    await updateVariable(owner, repo, 'READ_NUM', String(settings.readMinutes * 2));
    try { await updateVariable(owner, repo, 'READ_MINUTES', String(settings.readMinutes)); } catch {}
    if (settings.pushMethod) await updateVariable(owner, repo, 'PUSH_METHOD', settings.pushMethod);
    if (settings.selectedBooks.length > 0) await updateVariable(owner, repo, 'SELECTED_BOOKS', settings.selectedBooks.join(','));
  },

  async pushSecrets(owner: string, repo: string, settings: PanelSettings): Promise<void> {
    if (settings.wxpusherToken && !settings.wxpusherToken.startsWith('***')) await updateSecret(owner, repo, 'WXPUSHER_SPT', settings.wxpusherToken);
    if (settings.curlBash && !settings.curlBash.startsWith('***')) await updateSecret(owner, repo, 'WXREAD_CURL_BASH', settings.curlBash);
  },
};