import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error — .mjs 无类型声明
import { buildPushRequest, sendPush, WXPUSHER_ENCODED_MAX, PUSH_RETRY_DELAYS_MS } from '../../scripts/guard/push.mjs';

const creds = {
  PUSHPLUS_TOKEN: 'pp_token',
  WXPUSHER_SPT: 'AT_abc',
  TELEGRAM_BOT_TOKEN: '123:xyz',
  TELEGRAM_CHAT_ID: '456',
  SERVERCHAN_SPT: 'SCT123',
};

describe('buildPushRequest', () => {
  it('wxpusher 走 GET，content 在 URL path 且被 encodeURIComponent', () => {
    const req = buildPushRequest({ method: 'wxpusher', content: '异常 报告', title: 'T', creds });
    expect(req.init.method).toBe('GET');
    expect(req.url).toBe(
      'https://wxpusher.zjiecode.com/api/send/message/AT_abc/' + encodeURIComponent('异常 报告'),
    );
  });

  it('wxpusher 超长 content 被截断到 maxLen 并加省略号', () => {
    const req = buildPushRequest({ method: 'wxpusher', content: 'x'.repeat(50), title: 'T', creds, maxLen: 10 });
    expect(req.url).toContain(encodeURIComponent('x'.repeat(10) + '…'));
    expect(req.url).not.toContain('x'.repeat(11));
  });

  it('pushplus POST，body 含 token/title/content', () => {
    const req = buildPushRequest({ method: 'pushplus', content: '正文', title: '微信阅读-异常', creds });
    expect(req.url).toBe('https://www.pushplus.plus/send');
    expect(req.init.method).toBe('POST');
    const body = JSON.parse(req.init.body as string);
    expect(body).toEqual({ token: 'pp_token', title: '微信阅读-异常', content: '正文' });
  });

  it('telegram POST，body 含 chat_id/text', () => {
    const req = buildPushRequest({ method: 'telegram', content: '正文', title: 'T', creds });
    expect(req.url).toBe('https://api.telegram.org/bot123:xyz/sendMessage');
    expect(JSON.parse(req.init.body as string)).toEqual({ chat_id: '456', text: '正文' });
  });

  it('serverchan 用 desp 字段而非 content', () => {
    const req = buildPushRequest({ method: 'serverchan', content: '正文', title: '微信阅读-异常', creds });
    expect(req.url).toBe('https://sctapi.ftqq.com/SCT123.send');
    expect(JSON.parse(req.init.body as string)).toEqual({ title: '微信阅读-异常', desp: '正文' });
  });

  it('未配置渠道返回 null', () => {
    expect(buildPushRequest({ method: '', content: 'x', title: 'T', creds })).toBeNull();
    expect(buildPushRequest({ method: 'unknown', content: 'x', title: 'T', creds })).toBeNull();
  });

  it('渠道对应凭证缺失返回 null', () => {
    expect(buildPushRequest({ method: 'wxpusher', content: 'x', title: 'T', creds: {} })).toBeNull();
    expect(
      buildPushRequest({ method: 'telegram', content: 'x', title: 'T', creds: { TELEGRAM_BOT_TOKEN: 'a' } }),
    ).toBeNull();
  });

  it('方法名大小写不敏感', () => {
    expect(buildPushRequest({ method: 'WXPusher', content: 'x', title: 'T', creds })).not.toBeNull();
  });
});

describe('sendPush 重试', () => {
  it('首次成功返回 ok:true', async () => {
    // pushplus 成功是 HTTP 200 + {"code":200}，不能只给一个 '{}'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('{"code":200}') });
    const res = await sendPush({
      method: 'pushplus', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn(),
    });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('失败重试 3 次后放弃，退避序列 5s/20s/60s 截取前两次', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('err') });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const res = await sendPush({
      method: 'pushplus', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep,
    });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('500');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(PUSH_RETRY_DELAYS_MS).toEqual([5000, 20000, 60000]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5000, 20000]);
  });

  it('渠道未配置时返回 ok:false 且不发请求（不抛异常）', async () => {
    const fetchMock = vi.fn();
    const res = await sendPush({
      method: '', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn(),
    });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('未配置');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch 抛异常也纳入重试并最终返回 ok:false', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const res = await sendPush({
      method: 'wxpusher', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn(),
    });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('ECONNRESET');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('业务码判定（HTTP 200 不等于成功）', () => {
  it('wxpusher 返回 200 + code:1001（token 失效）视为失败', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: () => Promise.resolve('{"code":1001,"msg":"invalid token"}'),
    });
    const res = await sendPush({
      method: 'wxpusher', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn(),
    });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('业务失败');
  });

  it('serverchan 返回 200 + code:0 视为成功', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: () => Promise.resolve('{"code":0,"message":""}'),
    });
    const res = await sendPush({
      method: 'serverchan', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn(),
    });
    expect(res.ok).toBe(true);
  });

  it('telegram 返回 200 + ok:false 视为失败', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: () => Promise.resolve('{"ok":false,"description":"chat not found"}'),
    });
    const res = await sendPush({
      method: 'telegram', content: 'x', title: 'T', creds, fetchImpl: fetchMock, sleep: vi.fn(),
    });
    expect(res.ok).toBe(false);
  });

  it('wxpusher 长中文报告的 URL 编码后不超过 6000 字符', () => {
    const report = '微信阅读异常报告\n'.repeat(400);
    const req = buildPushRequest({ method: 'wxpusher', content: report, title: 'T', creds });
    expect(req).not.toBeNull();
    const encoded = req!.url.split('/').pop() as string;
    expect(encoded.length).toBeLessThanOrEqual(WXPUSHER_ENCODED_MAX + 12);
    expect(decodeURIComponent(encoded)).toContain('微信阅读异常报告');
  });
});
