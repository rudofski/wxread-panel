import { describe, it, expect } from 'vitest';
import { buildMonthBlocks, type DayStatus } from '@/utils/calendarGrid';

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function mkMap(entries: [string, DayStatus][]): Map<string, DayStatus> {
  return new Map(entries);
}

describe('buildMonthBlocks', () => {
  const year = 2026;
  const now = new Date(2026, 5, 15); // 2026-06-15

  it('输出 12 个月，且每个月的第一天位于该月第一个格子', () => {
    const blocks = buildMonthBlocks(year, new Map(), now);
    expect(blocks).toHaveLength(12);
    for (const b of blocks) {
      expect(b.weeks[0][0].date).toBe(fmt(year, b.month, 1));
    }
  });

  it('所有格子都属于对应月份，不跨月；空格子标记为 blank', () => {
    const blocks = buildMonthBlocks(year, new Map(), now);
    for (const b of blocks) {
      for (const week of b.weeks) {
        expect(week).toHaveLength(7);
        for (const cell of week) {
          if (cell.date) {
            expect(Number(cell.date.slice(5, 7)) - 1).toBe(b.month);
          } else {
            expect(cell.s).toBe('blank');
          }
        }
      }
    }
  });

  it('2026 年 2 月 28 天 = 4 列恰好放满（28 号在最后一列第 7 格，无空格）', () => {
    const blocks = buildMonthBlocks(year, new Map(), now);
    const feb = blocks[1];
    expect(feb.weeks).toHaveLength(4);
    const lastWeek = feb.weeks[3];
    expect(lastWeek.filter(c => !c.date)).toHaveLength(0);
    expect(lastWeek[6].date).toBe(fmt(year, 1, 28));
  });

  it('有运行记录的日期状态正确（非失败即绿）', () => {
    const dayMap = mkMap([
      [fmt(year, 0, 10), { s: 'success' }],
      [fmt(year, 0, 11), { s: 'failure', note: '鉴权失败' }],
    ]);
    const blocks = buildMonthBlocks(year, dayMap, now);
    const jan = blocks[0];
    // 1月10日 = 第2列第3格（10-7=3），1月11日 = 第2列第4格
    expect(jan.weeks[1][2].s).toBe('success');
    expect(jan.weeks[1][2].title).toContain('成功');
    expect(jan.weeks[1][3].s).toBe('failure');
    expect(jan.weeks[1][3].title).toContain('鉴权失败');
  });

  it('未来日期标记为 future，过去无记录标记为 empty', () => {
    const blocks = buildMonthBlocks(year, new Map(), now);
    const jun = blocks[5]; // 2026-06，now = 6-15
    expect(jun.weeks[1][4].date).toBe(fmt(year, 5, 12)); // 6月12日（过去）
    expect(jun.weeks[1][4].s).toBe('empty');
    expect(jun.weeks[2][0].date).toBe(fmt(year, 5, 15)); // 6月15日 = now
    expect(jun.weeks[2][0].s).toBe('empty');
    expect(jun.weeks[2][1].date).toBe(fmt(year, 5, 16)); // 6月16日（未来）
    expect(jun.weeks[2][1].s).toBe('future');
  });

  it('总列数（周数）等于各月列数之和：11 个月 5 列 + 2 月 4 列 = 59', () => {
    const blocks = buildMonthBlocks(year, new Map(), now);
    const total = blocks.reduce((sum, b) => sum + b.weeks.length, 0);
    expect(total).toBe(59);
  });
});
