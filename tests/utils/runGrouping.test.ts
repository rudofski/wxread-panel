import { describe, it, expect } from 'vitest';
import { localDateKey, groupRunsByLocalDay, daysForWidth } from '@/utils/runGrouping';

// 运行状态页"最近运行"横轴按日期归组。
// v0.1.7 修复根因：旧实现用 UTC 切片（.slice(0,10)）切日期、用本地时区显示时间，
// 两者不一致导致凌晨运行（UTC 深夜 = 本地次日凌晨）被归到前一天（如 08-24 05:18 跑到 08-23）。
// 修复：日期 key 与时间显示同源，统一用本地时区。

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface FakeRun { run_started_at: string | null; created_at: string; }

describe('localDateKey（本地时区日期 key）', () => {
  it('与本地时区格式化结果一致（与 formatTime 显示同源）', () => {
    const ts = '2026-08-24T03:18:00Z';
    expect(localDateKey(ts)).toBe(fmt(new Date(ts)));
  });

  it('UTC 深夜的运行归入本地次日（东时区），不再用 UTC 切片', () => {
    const ts = '2026-08-23T21:18:00Z';
    const key = localDateKey(ts);
    const offsetMin = new Date(ts).getTimezoneOffset(); // UTC - 本地（分钟）
    if (offsetMin < 0) {
      // 东时区（如 UTC+8）：UTC 21:18 = 本地次日凌晨 → key 必须晚于 UTC 日期
      expect(key > ts.slice(0, 10)).toBe(true);
      expect(key).not.toBe(ts.slice(0, 10));
    } else {
      expect(key).toBe(ts.slice(0, 10));
    }
  });
});

describe('groupRunsByLocalDay（横轴日期归组）', () => {
  const now = new Date('2026-08-25T12:00:00');

  it('输出 days 天轴：左早右近，末日为今天，今日在末尾', () => {
    const days = groupRunsByLocalDay([], 14, now);
    expect(days.length).toBe(14);
    expect(days[0].date).toBe(fmt(new Date(now.getTime() - 13 * 86400000)));
    expect(days[days.length - 1].date).toBe(fmt(now));
    expect(days[days.length - 1].label).toMatch(/^\d{2}-\d{2}$/);
  });

  it('每日内多条记录按时间正序（输入 API 倒序也能排正）', () => {
    const mk = (h: number, m: number): FakeRun => ({
      run_started_at: `2026-08-24T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
      created_at: `2026-08-24T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
    });
    const runs = [mk(12, 0), mk(9, 15), mk(6, 30)]; // API 倒序（新→旧）
    const days = groupRunsByLocalDay(runs, 14, now);
    const day = days.find(d => d.date === localDateKey('2026-08-24T00:00:00Z'))!;
    expect(day.runs.length).toBe(3);
    const times = day.runs.map(r => new Date(r.run_started_at!).getUTCHours());
    expect(times).toEqual([6, 9, 12]); // 正序：早→晚（UTC 小时，与时区无关）
  });

  it('无记录的天 runs 为空数组（渲染为 -）', () => {
    const days = groupRunsByLocalDay([], 7, now);
    expect(days.every(d => d.runs.length === 0)).toBe(true);
  });

  it('优先使用 run_started_at 归组，缺失时回退 created_at', () => {
    const runs: FakeRun[] = [
      { run_started_at: '2026-08-23T21:18:00Z', created_at: '2026-08-23T21:18:00Z' },
      { run_started_at: null, created_at: '2026-08-22T10:00:00Z' },
    ];
    const days = groupRunsByLocalDay(runs, 14, now);
    const first = days.find(d => d.runs.length > 0);
    expect(first).toBeDefined();
    // 无 run_started_at 的记录按 created_at 的本地日期归组
    expect(localDateKey('2026-08-22T10:00:00Z')).toBe(fmt(new Date('2026-08-22T10:00:00Z')));
  });
});

describe('daysForWidth（响应式天数）', () => {
  it('窄屏减少天数保证每列可读，宽屏用满 14 天', () => {
    expect(daysForWidth(800)).toBe(7);
    expect(daysForWidth(899)).toBe(7);
    expect(daysForWidth(900)).toBe(10);
    expect(daysForWidth(1279)).toBe(10);
    expect(daysForWidth(1280)).toBe(14);
    expect(daysForWidth(1920)).toBe(14);
  });
});
