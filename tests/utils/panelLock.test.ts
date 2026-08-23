import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { isLockEnabled, verifyPassword, isUnlocked, setUnlocked } from '@/utils/panelLock';

describe('panelLock（可选密码门）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    localStorage.clear();
  });

  it('未配置 VITE_PANEL_PASSWORD 时不启用', () => {
    expect(isLockEnabled()).toBe(false);
  });

  it('配置 VITE_PANEL_PASSWORD 后启用', () => {
    vi.stubEnv('VITE_PANEL_PASSWORD', 'my-secret');
    expect(isLockEnabled()).toBe(true);
  });

  it('正确密码验证通过（哈希比较，JS 不含明文）', async () => {
    vi.stubEnv('VITE_PANEL_PASSWORD', 'my-secret');
    expect(await verifyPassword('my-secret')).toBe(true);
  });

  it('错误密码验证失败', async () => {
    vi.stubEnv('VITE_PANEL_PASSWORD', 'my-secret');
    expect(await verifyPassword('wrong')).toBe(false);
  });

  it('未启用时任意输入均放行', async () => {
    expect(await verifyPassword('')).toBe(true);
  });

  it('解锁状态：默认未解锁，setUnlocked 后解锁，24h 内有效', () => {
    expect(isUnlocked()).toBe(false);
    setUnlocked();
    expect(isUnlocked()).toBe(true);
    // 模拟超过 24 小时后过期
    const past = Date.now() - 25 * 3600 * 1000;
    localStorage.setItem('panel_unlocked_at', String(past));
    expect(isUnlocked()).toBe(false);
  });
});
