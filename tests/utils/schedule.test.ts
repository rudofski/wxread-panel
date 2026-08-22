import { describe, it, expect, beforeEach } from 'vitest';
import { loadSchedule, saveSchedule, isValidSchedule } from '@/utils/schedule';

const KEY = 'wxread_schedule';

describe('schedule utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isValidSchedule 接受合法时间', () => {
    expect(isValidSchedule({ enabled: true, time: '08:00' })).toBe(true);
    expect(isValidSchedule({ enabled: false, time: '23:59' })).toBe(true);
  });

  it('isValidSchedule 拒绝非法时间', () => {
    expect(isValidSchedule({ enabled: true, time: '25:00' })).toBe(false);
    expect(isValidSchedule({ enabled: true, time: '8:0' })).toBe(false);
    expect(isValidSchedule({ enabled: true, time: '' })).toBe(false);
    expect(isValidSchedule({ enabled: true, time: 'abc' })).toBe(false);
  });

  it('无保存数据时返回默认值（禁用、08:00）', () => {
    expect(loadSchedule()).toEqual({ enabled: false, time: '08:00' });
  });

  it('saveSchedule 后可读回', () => {
    saveSchedule({ enabled: true, time: '21:30' });
    expect(loadSchedule()).toEqual({ enabled: true, time: '21:30' });
  });

  it('localStorage 中非法 JSON 时回退默认值', () => {
    localStorage.setItem(KEY, 'not-json');
    expect(loadSchedule()).toEqual({ enabled: false, time: '08:00' });
  });

  it('localStorage 中缺字段时回退默认值', () => {
    localStorage.setItem(KEY, JSON.stringify({ enabled: true }));
    expect(loadSchedule()).toEqual({ enabled: false, time: '08:00' });
  });
});
