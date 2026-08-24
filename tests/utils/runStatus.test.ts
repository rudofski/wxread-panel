import { describe, it, expect } from 'vitest';
import { classifyRun } from '@/utils/runStatus';

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
