import { describe, it, expect } from 'vitest';
import { evaluatePushStatus } from '@/utils/pushStatus';

describe('evaluatePushStatus', () => {
  it('远程状态未加载时为 unknown', () => {
    expect(evaluatePushStatus('wxpusher', {}).status).toBe('unknown');
  });

  it('未启用推送为 warn', () => {
    const r = evaluatePushStatus('', { WXPUSHER_SPT: true });
    expect(r.status).toBe('warn');
    expect(r.missing).toEqual([]);
  });

  it('wxpusher 凭证存在为 ok', () => {
    expect(evaluatePushStatus('wxpusher', { WXPUSHER_SPT: true }).status).toBe('ok');
  });

  it('wxpusher 凭证缺失为 error 且列出缺失项', () => {
    const r = evaluatePushStatus('wxpusher', { WXPUSHER_SPT: false, PUSH_METHOD: true });
    expect(r.status).toBe('error');
    expect(r.missing).toEqual(['WXPUSHER_SPT']);
  });

  it('pushplus 只看 PUSHPLUS_TOKEN', () => {
    expect(evaluatePushStatus('pushplus', { PUSHPLUS_TOKEN: true }).status).toBe('ok');
    expect(evaluatePushStatus('pushplus', { WXPUSHER_SPT: true }).status).toBe('error');
  });

  it('telegram 需要 token 与 chat_id 同时存在', () => {
    expect(
      evaluatePushStatus('telegram', { TELEGRAM_BOT_TOKEN: true, TELEGRAM_CHAT_ID: true }).status,
    ).toBe('ok');
    const r = evaluatePushStatus('telegram', { TELEGRAM_BOT_TOKEN: true, TELEGRAM_CHAT_ID: false });
    expect(r.status).toBe('error');
    expect(r.missing).toEqual(['TELEGRAM_CHAT_ID']);
  });

  it('serverchan 只看 SERVERCHAN_SPT', () => {
    expect(evaluatePushStatus('serverchan', { SERVERCHAN_SPT: true }).status).toBe('ok');
  });

  it('未知渠道为 error', () => {
    const r = evaluatePushStatus('foobar', { PUSH_METHOD: true });
    expect(r.status).toBe('error');
    expect(r.missing).toEqual(['PUSH_METHOD']);
  });
});
