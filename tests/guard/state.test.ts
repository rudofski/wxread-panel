import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error — .mjs 无类型声明
import { emptyGuardState, readGuardState, writeGuardState, GUARD_STATE_NAME, shouldAlert, shouldDispatch } from '../../scripts/guard/state.mjs';

const cfg = { owner: 'o', repo: 'r', token: 't' };
const now = new Date('2026-11-10T12:00:00+08:00');
// ghRequest 的签名是 (path, params, opts)，因此读回的值在返回对象的 data.value 上
const okData = (value: unknown) => ({ data: { value } });

describe('emptyGuardState', () => {
  it('返回当日空状态结构', () => {
    const s = emptyGuardState(now);
    expect(s.date).toBe('2026-11-10');
    expect(s.dispatchedAt).toBeNull();
    expect(s.alertedAt).toBeNull();
    expect(s.lastState).toBe('');
  });
});

describe('readGuardState', () => {
  it('读取不到（404）时返回当日空状态', async () => {
    const io = { request: vi.fn().mockRejectedValue(Object.assign(new Error('404'), { status: 404 })) };
    const s = await readGuardState(cfg, now, io);
    expect(s).toEqual(emptyGuardState(now));
  });

  it('读到别的日期时重置为当日空状态（跨日去重）', async () => {
    const io = {
      request: vi.fn().mockResolvedValue(okData(JSON.stringify({ date: '2026-11-09', dispatchedAt: 'x' }))),
    };
    const s = await readGuardState(cfg, now, io);
    expect(s.date).toBe('2026-11-10');
    expect(s.dispatchedAt).toBeNull();
  });

  it('读到当日状态时原样返回', async () => {
    const stored = { date: '2026-11-10', dispatchedAt: '2026-11-10T05:31:00+08:00', alertedAt: null, lastState: 'active', lastError: '' };
    const io = { request: vi.fn().mockResolvedValue(okData(JSON.stringify(stored))) };
    expect(await readGuardState(cfg, now, io)).toMatchObject(stored);
  });

  it('JSON 损坏时回退空状态，不抛错', async () => {
    const io = { request: vi.fn().mockResolvedValue(okData('{bad')) };
    expect((await readGuardState(cfg, now, io)).date).toBe('2026-11-10');
  });
});

describe('writeGuardState', () => {
  it('PATCH 404 时回退 POST 创建 Variable', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('404'), { status: 404 }))
      .mockResolvedValueOnce({});
    const s = { ...emptyGuardState(now), lastState: 'active' };
    await writeGuardState(cfg, s, { request });
    expect(request.mock.calls[0][2]).toMatchObject({ method: 'PATCH' });
    expect(request.mock.calls[1][1]).toEqual({ owner: 'o', repo: 'r' });
    expect(request.mock.calls[1][2]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(request.mock.calls[1][2].body.value)).toMatchObject({ date: '2026-11-10', lastState: 'active' });
  });

  it('写入的 Variable 名为 GUARD_STATE', async () => {
    const request = vi.fn().mockResolvedValue({});
    await writeGuardState(cfg, emptyGuardState(now), { request });
    expect(request.mock.calls[0][1]).toMatchObject({ name: GUARD_STATE_NAME, owner: 'o', repo: 'r' });
    expect(request.mock.calls[0][2].body).toMatchObject({ name: GUARD_STATE_NAME });
  });
});

describe('去重判定', () => {
  const s = { ...emptyGuardState(now) };

  it('当日已 dispatch 过则不再 dispatch', () => {
    expect(shouldDispatch({ ...s, dispatchedAt: '2026-11-10T05:31:00+08:00' })).toBe(false);
    expect(shouldDispatch(s)).toBe(true);
  });

  it('当日已 alert 过则不再 alert', () => {
    expect(shouldAlert({ ...s, alertedAt: '2026-11-10T12:00:10+08:00' })).toBe(false);
    expect(shouldAlert(s)).toBe(true);
  });
});
