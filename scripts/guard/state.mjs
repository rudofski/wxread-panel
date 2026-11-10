// GUARD_STATE：存在目标仓库的 Actions Variable 里，用于「同一自然日只补跑一次、只告警一次」。
// 用 Variable 而非 Secret：值要可读回，且不含任何密钥。
import { ghRequest } from './github.mjs';

export const GUARD_STATE_NAME = 'GUARD_STATE';
const WRITE_ATTEMPTS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (err?.status === 404) return fresh; // 只有「确实还不存在」才算首次
    // 403 / 429 / 5xx 一律上抛：把「读不到」当成「今天还没做」会重复补跑、重复告警，
    // 而且掩盖了 PAT 权限配错这个真正需要人处理的问题。
    throw err;
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

export async function writeGuardState(cfg, state, io = defaultIo, { sleep: wait = sleep } = {}) {
  const value = JSON.stringify(state);
  const params = { owner: cfg.owner, repo: cfg.repo, name: GUARD_STATE_NAME };
  const patch = () => io.request('/repos/{owner}/{repo}/actions/variables/{name}', params, {
    token: cfg.token, method: 'PATCH', body: { name: GUARD_STATE_NAME, value },
  });
  const create = () => io.request('/repos/{owner}/{repo}/actions/variables', { owner: cfg.owner, repo: cfg.repo }, {
    token: cfg.token, method: 'POST', body: { name: GUARD_STATE_NAME, value },
  });

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    try {
      await patch();
      return;
    } catch (err) {
      if (err?.status === 404) {
        try {
          await create();
          return;
        } catch (err2) {
          // 409 = 另一轮刚刚建好，下一次 PATCH 即可，不算失败
          if (err2?.status !== 409) throw err2;
          continue;
        }
      }
      if (err?.status === 429 || err?.status >= 500) {
        await wait(1000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`GUARD_STATE 写入失败：重试 ${WRITE_ATTEMPTS} 次仍不成功`);
}

export function shouldDispatch(state) {
  return !state?.dispatchedAt;
}

export function shouldAlert(state) {
  return !state?.alertedAt;
}
