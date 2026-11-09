import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs 无类型声明
import { buildReport } from '../../scripts/guard/report.mjs';

const base = {
  now: new Date('2026-11-10T12:00:12+08:00'),
  owner: 'rudofski',
  repo: 'wxread',
  workflowPath: '.github/workflows/deploy.yml',
  workflowState: 'active',
  scheduledHour: 5,
  runs: [] as any[],
  actions: [] as string[],
  reason: '12:00 前今日没有任何运行记录',
  hasSuccess: false,
};

describe('buildReport', () => {
  it('包含标题、检查时间、目标仓库', () => {
    const md = buildReport(base);
    expect(md).toContain('wxread 每日运行异常报告');
    expect(md).toContain('2026-11-10 12:00');
    expect(md).toContain('rudofski/wxread');
  });

  it('零运行时不崩，并写明没有任何运行记录', () => {
    const md = buildReport(base);
    expect(md).toContain('没有任何运行');
    expect(md).toContain('共 0 条记录');
  });

  it('列出每条运行的结论与耗时', () => {
    const md = buildReport({
      ...base,
      runs: [
        { status: 'completed', conclusion: 'failure', when: '2026-11-10T05:03:00+08:00', durationSec: 252 },
        { status: 'completed', conclusion: 'cancelled', when: '2026-11-10T04:45:00+08:00', durationSec: null },
      ],
    });
    expect(md).toContain('05:03');
    expect(md).toContain('failure');
    expect(md).toContain('4分12秒');
    expect(md).toContain('cancelled');
    expect(md).toContain('共 2 条记录');
  });

  it('包含已执行动作与建议链接', () => {
    const md = buildReport({
      ...base,
      actions: ['04:45 预检：工作流状态 active，无需启用', '05:30 复查：已触发一次补跑'],
    });
    expect(md).toContain('已执行的动作');
    expect(md).toContain('04:45 预检');
    expect(md).toContain('https://github.com/rudofski/wxread/actions');
  });

  it('工作流停用时显示停用状态与启用建议', () => {
    const md = buildReport({ ...base, workflowState: 'disabled_manually' });
    expect(md).toContain('disabled_manually');
    expect(md).toContain('停用');
  });
});
