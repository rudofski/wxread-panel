import { describe, it, expect } from 'vitest';
import { classifyRun, pickDayStatus } from '@/utils/runStatus';

// 运行状态统一分类：Dashboard 圆点与运行日历格子共用同一判定，
// 保证"最近运行"与"运行日历"状态完全同步（v0.1.7 修复）。
// 四档：running(蓝) / success(绿) / failure(红) / idle(灰，cancelled/skipped/timed_out 等)。

interface RunLike { status: string; conclusion: string | null; }

describe('classifyRun（运行状态统一分类）', () => {
  it('in_progress → running（运行中）', () => {
    expect(classifyRun({ status: 'in_progress', conclusion: null })).toBe('running');
  });

  it('conclusion success → success', () => {
    expect(classifyRun({ status: 'completed', conclusion: 'success' })).toBe('success');
  });

  it('conclusion failure → failure', () => {
    expect(classifyRun({ status: 'completed', conclusion: 'failure' })).toBe('failure');
  });

  it('cancelled / skipped / timed_out / neutral / 空 → idle（灰）', () => {
    expect(classifyRun({ status: 'completed', conclusion: 'cancelled' })).toBe('idle');
    expect(classifyRun({ status: 'completed', conclusion: 'skipped' })).toBe('idle');
    expect(classifyRun({ status: 'completed', conclusion: 'timed_out' })).toBe('idle');
    expect(classifyRun({ status: 'completed', conclusion: 'neutral' })).toBe('idle');
    expect(classifyRun({ status: 'completed', conclusion: null })).toBe('idle');
  });

  it('in_progress 优先于 conclusion（运行中即使带旧结论也是 running）', () => {
    expect(classifyRun({ status: 'in_progress', conclusion: 'success' })).toBe('running');
  });
});

describe('pickDayStatus（每日成功优先，无成功取最新）', () => {
  const mk = (id: number, started: string, status: string, conclusion: string | null) => ({
    id, status, conclusion,
    created_at: started, run_started_at: started, updated_at: started,
  });

  it('当日有成功 → 返回成功（即使最后一条是失败）', () => {
    const runs = [
      mk(3, '2026-08-24T12:00:00Z', 'completed', 'failure'),   // 最新：失败
      mk(2, '2026-08-24T09:00:00Z', 'completed', 'success'),   // 成功
      mk(1, '2026-08-24T06:00:00Z', 'completed', 'failure'),
    ];
    expect(classifyRun(pickDayStatus(runs)!)).toBe('success');
  });

  it('当日无成功 → 返回最新一条（时间最大）', () => {
    const runs = [
      mk(1, '2026-08-24T06:00:00Z', 'completed', 'failure'),
      mk(2, '2026-08-24T12:00:00Z', 'completed', 'failure'),
    ];
    const picked = pickDayStatus(runs)!;
    expect(picked.id).toBe(2);
    expect(classifyRun(picked)).toBe('failure');
  });

  it('无成功且最新为运行中 → 返回运行中', () => {
    const runs = [
      mk(1, '2026-08-24T06:00:00Z', 'completed', 'cancelled'),
      mk(2, '2026-08-24T12:00:00Z', 'in_progress', null),
    ];
    expect(classifyRun(pickDayStatus(runs)!)).toBe('running');
  });

  it('空数组 → null', () => {
    expect(pickDayStatus([])).toBeNull();
  });

  it('不依赖输入顺序（乱序也能选出最新）', () => {
    const runs = [
      mk(2, '2026-08-24T12:00:00Z', 'completed', 'failure'),
      mk(1, '2026-08-24T06:00:00Z', 'completed', 'cancelled'),
    ];
    const picked = pickDayStatus(runs)!;
    expect(picked.id).toBe(2);
  });
});
