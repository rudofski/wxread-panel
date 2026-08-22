import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

describe('settings store', () => {
  beforeEach(() => { setActivePinia(createPinia()); });

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
});