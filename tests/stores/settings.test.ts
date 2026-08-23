import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('readCount 应为 readMinutes x 2', () => {
    const store = useSettingsStore();
    store.readMinutes = 60; expect(store.readCount).toBe(120);
    store.readMinutes = 10; expect(store.readCount).toBe(20);
  });

  it('默认推送方式为 wxpusher', () => {
    expect(useSettingsStore().pushMethod).toBe('wxpusher');
  });

  it('默认阅读时长为 40 分钟', () => {
    expect(useSettingsStore().readMinutes).toBe(40);
  });

  it('quickReadOptions 应有 6 个选项', () => {
    expect(useSettingsStore().quickReadOptions).toHaveLength(6);
  });

  it('持久化：修改字段后重新创建 store 可恢复（记忆存储）', async () => {
    const store = useSettingsStore();
    store.repoUrl = 'https://github.com/rudofski/wxread';
    store.readMinutes = 60;
    store.pushMethod = 'pushplus';
    store.curlBash = 'curl \'https://weread.qq.com/web/book/read\' -H \'cookie: wr_vid=test\'';
    store.wxpusherToken = 'AT_persist_test';
    // 等待 watch 自动持久化（异步 flush）
    await vi.waitFor(() => expect(localStorage.getItem('wxread_panel_settings')).not.toBeNull());

    // 模拟重新打开面板：新的 pinia 实例
    setActivePinia(createPinia());
    const store2 = useSettingsStore();
    expect(store2.repoUrl).toBe('https://github.com/rudofski/wxread');
    expect(store2.readMinutes).toBe(60);
    expect(store2.pushMethod).toBe('pushplus');
    expect(store2.curlBash).toContain('wr_vid=test');
    expect(store2.wxpusherToken).toBe('AT_persist_test');
  });

  it('无持久化数据时使用默认值', () => {
    const store = useSettingsStore();
    expect(store.repoUrl).toBe('');
    expect(store.readMinutes).toBe(40);
    expect(store.pushMethod).toBe('wxpusher');
  });

  it('持久化数据损坏时回退默认值', () => {
    localStorage.setItem('wxread_panel_settings', '{bad json');
    setActivePinia(createPinia());
    const store = useSettingsStore();
    expect(store.readMinutes).toBe(40);
    expect(store.repoUrl).toBe('');
  });
});