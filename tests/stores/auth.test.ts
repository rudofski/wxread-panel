import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';

describe('auth store（纯 PAT 登录）', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('未登录时 isAuthenticated 为 false', () => {
    expect(useAuthStore().isAuthenticated).toBe(false);
  });

  it('setToken 后登录且写入 localStorage', () => {
    const auth = useAuthStore();
    auth.setToken('ghp_abcdef123456');
    expect(auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('github_token')).toBe('ghp_abcdef123456');
  });

  it('已有 token 时初始化即为登录态', () => {
    localStorage.setItem('github_token', 'ghp_persisted');
    setActivePinia(createPinia());
    expect(useAuthStore().isAuthenticated).toBe(true);
  });

  it('logout 清除登录态与 localStorage', () => {
    const auth = useAuthStore();
    auth.setToken('ghp_abcdef');
    auth.logout();
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('github_token')).toBeNull();
  });

  it('不含 OAuth 交换方法（纯前端无法安全交换）', () => {
    const auth = useAuthStore();
    expect(typeof (auth as any).getOAuthUrl).toBe('undefined');
  });
});
