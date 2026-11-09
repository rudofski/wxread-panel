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
      init: {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ token: c.PUSHPLUS_TOKEN, title: subject, content: text }),
      },
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
      const res = await fetchImpl(req.url, req.init);
      const bodyText = typeof res.text === 'function' ? await res.text() : '';
      if (res.ok) return { ok: true, channel, detail: bodyText.slice(0, 200) };
      lastDetail = `HTTP ${res.status}: ${bodyText.slice(0, 200)}`;
    } catch (err) {
      lastDetail = `请求异常: ${err?.message || err}`;
    }
    if (attempt < PUSH_RETRY_DELAYS_MS.length - 1) await sleep(PUSH_RETRY_DELAYS_MS[attempt]);
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
