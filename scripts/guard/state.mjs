// GUARD_STATE：存在目标仓库的 Actions Variable 里，用于「同一自然日只补跑一次、只告警一次」。
// 用 Variable 而非 Secret：值要可读回，且不含任何密钥。
import { ghRequest } from './github.mjs';

export const GUARD_STATE_NAME = 'GUARD_STATE';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDate(date) {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`;
}

export function emptyGuardState(now) {
  return {
    date: shanghaiDate(now),
    dispatchedAt: null,
    alertedAt: null,
    lastState: '',
    lastError: '',
  };
}

/** io.request 与 ghRequest 同签名，便于测试注入；返回 { data: {...} } */
export const stateIo = {
  request: async (...args) => ({ data: await ghRequest(...args) }),
};
const defaultIo = stateIo;

export async function readGuardState(cfg, now, io = defaultIo) {
  const fresh = emptyGuardState(now);
  let raw;
  try {
    const data = await io.request(
      '/repos/{owner}/{repo}/actions/variables/{name}',
      { owner: cfg.owner, repo: cfg.repo, name: GUARD_STATE_NAME },
      { token: cfg.token },
    );
    // 约定：io.request 返回 { data: {...} }（与 octokit 的 request 同形）
    raw = data?.data?.value;
  } catch (err) {
    if (err?.status === 404) return fresh;
    // 其他错误（限流等）不阻断守护：按「今天还没做过」处理，最坏多补跑一次
    return fresh;
  }

  if (!raw) return fresh;
  try {
    const parsed = JSON.parse(raw);
    // 跨日重置：昨天的 dispatchedAt/alertedAt 不能压住今天的动作
    if (parsed?.date !== fresh.date) return fresh;
    return {
      ...fresh,
      ...parsed,
      dispatchedAt: parsed.dispatchedAt ?? null,
      alertedAt: parsed.alertedAt ?? null,
      lastState: parsed.lastState ?? '',
      lastError: parsed.lastError ?? '',
    };
  } catch {
    return fresh;
  }
}

export async function writeGuardState(cfg, state, io = defaultIo) {
  const value = JSON.stringify(state);
  const params = { owner: cfg.owner, repo: cfg.repo, name: GUARD_STATE_NAME };
  try {
    await io.request('/repos/{owner}/{repo}/actions/variables/{name}', params, {
      token: cfg.token, method: 'PATCH', body: { name: GUARD_STATE_NAME, value },
    });
  } catch (err) {
    if (err?.status !== 404) throw err;
    await io.request('/repos/{owner}/{repo}/actions/variables', { owner: cfg.owner, repo: cfg.repo }, {
      token: cfg.token, method: 'POST', body: { name: GUARD_STATE_NAME, value },
    });
  }
}

export function shouldDispatch(state) {
  return !state?.dispatchedAt;
}

export function shouldAlert(state) {
  return !state?.alertedAt;
}
