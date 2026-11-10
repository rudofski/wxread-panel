import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs 无类型声明，运行时导入
import { decide } from '../../scripts/guard/decide.mjs';

const SH = (h: number, m = 0) =>
  new Date(`2026-11-10T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`);

const successRun = { status: 'completed', conclusion: 'success', when: '2026-11-10T05:03:00+08:00' };
const failRun = { status: 'completed', conclusion: 'failure', when: '2026-11-10T05:03:00+08:00' };
const runningRun = { status: 'in_progress', conclusion: null, when: '2026-11-10T05:02:00+08:00' };

describe('decide 决策', () => {
  it('工作流被停用时 needRepair 为真（最高优先级）', () => {
    const r = decide({ mode: 'preflight', now: SH(4, 45), workflowState: 'disabled_manually', runs: [successRun] });
    expect(r.needRepair).toBe(true);
    expect(r.reason).toContain('disabled_manually');
  });

  it('今日已成功：不补跑、不告警', () => {
    const r = decide({ mode: 'inspect', now: SH(12), workflowState: 'active', runs: [successRun] });
    expect(r.needDispatch).toBe(false);
    expect(r.needAlert).toBe(false);
  });

  it('今日存在运行中：等待，不干预', () => {
    const r = decide({ mode: 'preflight', now: SH(6), workflowState: 'active', runs: [runningRun] });
    expect(r.needDispatch).toBe(false);
    expect(r.reason).toContain('运行中');
  });

  it('已过计划点+宽限且今日零运行：需要补跑', () => {
    const r = decide({ mode: 'preflight', now: SH(6, 10), workflowState: 'active', runs: [] });
    expect(r.needDispatch).toBe(true);
  });

  it('未过计划点+宽限且今日零运行：不补跑（等 cron 自己跑）', () => {
    const r = decide({ mode: 'preflight', now: SH(4, 45), workflowState: 'active', runs: [] });
    expect(r.needDispatch).toBe(false);
  });

  it('05:30 是补跑窗口：过了 30 分钟宽限且今日无运行 → 补跑', () => {
    const r = decide({ mode: 'preflight', now: SH(5, 30), workflowState: 'active', runs: [] });
    expect(r.needDispatch).toBe(true);
  });

  it('05:29 仍在宽限内：不补跑', () => {
    const r = decide({ mode: 'preflight', now: SH(5, 29), workflowState: 'active', runs: [] });
    expect(r.needDispatch).toBe(false);
  });

  it('已有健康运行中的任务：不补跑', () => {
    const r = decide({
      mode: 'preflight', now: SH(5, 40), workflowState: 'active',
      runs: [{ status: 'in_progress', conclusion: null, when: SH(5, 35).toISOString() }],
    });
    expect(r.needDispatch).toBe(false);
    expect(r.reason).toContain('等待');
  });

  it('12:00 有运行中但未超时的任务：仍然告警（不能因为有东西在跑就闭嘴）', () => {
    const r = decide({
      mode: 'inspect', now: SH(12), workflowState: 'active',
      runs: [{ status: 'in_progress', conclusion: null, when: SH(11, 40).toISOString() }],
    });
    expect(r.needAlert).toBe(true);
    expect(r.needDispatch).toBe(false);
  });

  it('运行超过 120 分钟视为卡死：告警且允许补跑', () => {
    const r = decide({
      mode: 'inspect', now: SH(12), workflowState: 'active',
      runs: [{ status: 'in_progress', conclusion: null, when: SH(9, 0).toISOString() }],
    });
    expect(r.needAlert).toBe(true);
    expect(r.needDispatch).toBe(true);
    expect(r.reason).toContain('卡死');
  });

  it('12:00 工作流仍被停用：也要告警（自动 enable 未必成功）', () => {
    const r = decide({ mode: 'inspect', now: SH(12), workflowState: 'disabled_manually', runs: [] });
    expect(r.needRepair).toBe(true);
    expect(r.needAlert).toBe(true);
  });

  it('04:45 工作流被停用：只修不告警', () => {
    const r = decide({ mode: 'preflight', now: SH(4, 45), workflowState: 'disabled_manually', runs: [] });
    expect(r.needRepair).toBe(true);
    expect(r.needAlert).toBe(false);
  });

  it('inspect 模式 12:00 且今日只有失败：需要告警', () => {
    const r = decide({ mode: 'inspect', now: SH(12), workflowState: 'active', runs: [failRun] });
    expect(r.needAlert).toBe(true);
    expect(r.reason).toContain('失败');
  });

  it('inspect 模式未到 12:00：不告警', () => {
    const r = decide({ mode: 'inspect', now: SH(11, 0), workflowState: 'active', runs: [failRun] });
    expect(r.needAlert).toBe(false);
  });

  it('inspect 模式今日零运行：需要告警', () => {
    const r = decide({ mode: 'inspect', now: SH(12, 1), workflowState: 'active', runs: [] });
    expect(r.needAlert).toBe(true);
    expect(r.reason).toContain('没有任何运行');
  });

  it('昨日成功不算今日成功', () => {
    const yesterday = { status: 'completed', conclusion: 'success', when: '2026-11-09T05:03:00+08:00' };
    const r = decide({ mode: 'inspect', now: SH(12), workflowState: 'active', runs: [yesterday] });
    expect(r.needAlert).toBe(true);
  });

  it('宽限期可配置：graceMin=0 时刚过 05:00 即允许补跑', () => {
    const r = decide({ mode: 'preflight', now: SH(5, 1), workflowState: 'active', runs: [], graceMin: 0 });
    expect(r.needDispatch).toBe(true);
  });
});
