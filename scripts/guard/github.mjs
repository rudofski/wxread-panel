// GitHub REST 客户端（守护专用）：零依赖，只用 Node 内置 fetch。
// 之所以不用 octokit：守护工作流只跑 3 个请求，避免引入 node_modules 与 install 步骤。

export const API_BASE = 'https://api.github.com';
export const API_VERSION = '2022-11-28';

const PLACEHOLDER = /\{([a-zA-Z_]+)\}/g;

/** 把 '/repos/{owner}/{repo}' 与 params 合成实际路径；缺失的占位符原样保留，便于排错 */
export function fillTemplate(path, params = {}) {
  return String(path).replace(PLACEHOLDER, (whole, key) =>
    params[key] === undefined || params[key] === null ? whole : encodeURIComponent(String(params[key])),
  );
}

/** 统一把 HTTP 状态翻译成人和微信都能读懂的一句话 */
export function classifyHttpError(status, body = '') {
  const detail = String(body || '').slice(0, 300);
  if (status === 401) return `GitHub 认证失败（401）：PAT 无效或已过期，请重新生成 WXREAD_GUARD_PAT。${detail}`;
  if (status === 403) return `GitHub 拒绝访问（403）：PAT 缺少 actions:write 权限或触发限流。${detail}`;
  if (status === 404) return `目标不存在（404）：仓库、工作流或文件不存在，或 PAT 无权访问该仓库。${detail}`;
  if (status === 422) return `请求无法处理（422）：参数不合法，通常是 ref 分支名写错。${detail}`;
  if (status >= 500) return `GitHub 服务端故障（${status}），稍后重试即可。${detail}`;
  return `GitHub 请求失败（${status}）：${detail}`;
}

/** 日志里不许出现 token：异常体里可能回显 Authorization/query */
export function maskSecrets(text) {
  return String(text ?? '')
    .replace(/(token|authorization|pat)[=:][^&\s"']+/gi, '$1=REDACTED')
    .slice(0, 300);
}

function buildError(status, body) {
  const err = new Error(classifyHttpError(status, maskSecrets(body)));
  err.status = status;
  err.body = body;
  return err;
}

/**
 * @param {string} path          带 {owner} 等占位符的路径
 * @param {object} params        占位符取值
 * @param {{token:string, fetchImpl?:Function, method?:string, body?:any}} opts
 */
export async function ghRequest(
  path,
  params,
  { token, fetchImpl = globalThis.fetch, method = 'GET', body, query } = {},
) {
  let url = API_BASE + fillTemplate(path, params);
  if (query) url += '?' + new URLSearchParams(query).toString();
  const init = {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'wxread-guard',
    },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetchImpl(url, init);
  const text = typeof res.text === 'function' ? await res.text() : '';

  if (!res.ok) throw buildError(res.status, text);

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 从环境变量解析守护配置；缺少必填项直接抛错（让工作流红掉，比静默跳过安全） */
export function parseGuardEnv(env = process.env) {
  const token = (env.WXREAD_GUARD_PAT || '').trim();
  const rawRepo = (env.WXREAD_REPO || '').trim();

  if (!token) throw new Error('缺少 WXREAD_GUARD_PAT（需 actions:write 权限的细粒度 PAT）');
  if (!rawRepo) throw new Error('缺少 WXREAD_REPO（形如 rudofski/wxread）');

  const cleaned = rawRepo.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '');
  const [owner, repo] = cleaned.split('/');
  if (!owner || !repo) throw new Error(`WXREAD_REPO 格式不正确：${rawRepo}（应为 owner/repo）`);

  const num = (v, fallback) => {
    const n = Number.parseInt(v ?? '', 10);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    token,
    owner,
    repo,
    workflowPath: (env.WXREAD_WORKFLOW || 'deploy.yml').trim(),
    ref: (env.WXREAD_REF || 'main').trim(),
    scheduledHour: num(env.WXREAD_SCHEDULED_HOUR, 5),
    graceMin: num(env.WXREAD_GRACE_MIN, 30),
    inspectHour: num(env.WXREAD_INSPECT_HOUR, 12),
    staleMin: num(env.WXREAD_STALE_MIN, 120),
  };
}
