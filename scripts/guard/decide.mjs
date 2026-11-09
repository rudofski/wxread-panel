// 纯函数决策层：不读时钟、不发请求，时间与数据全部由参数注入，便于 TDD 与本地复算。

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);

/** 取某时刻在 Asia/Shanghai 的「当日零点」毫秒数 */
export function shanghaiDayStart(ms) {
  const shifted = ms + SHANGHAI_OFFSET_MS; // 平移后按 UTC 取整日
  const dayStartShifted = Math.floor(shifted / 86400000) * 86400000;
  return dayStartShifted - SHANGHAI_OFFSET_MS;
}

/** 取某时刻在 Asia/Shanghai 的「当日第几分钟」（0-1439） */
export function shanghaiMinuteOfDay(ms) {
  return Math.floor((ms + SHANGHAI_OFFSET_MS) / 60000) % 1440;
}

function runTime(run) {
  const t = new Date(run.when || '').getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {object} input
 * @param {'preflight'|'inspect'} input.mode
 * @param {Date} input.now
 * @param {string} input.workflowState      active / disabled_manually / disabled_inactivity / ...
 * @param {Array<{status:string, conclusion:string|null, when:string}>} input.runs  今日或更早都可传入
 * @param {number} [input.scheduledHour]    每日计划运行小时（上海时区）
 * @param {number} [input.graceMin]         计划点后的宽限分钟
 * @param {number} [input.inspectHour]      巡检小时
 */
export function decide({
  mode,
  now,
  workflowState,
  runs = [],
  scheduledHour = 5,
  graceMin = 60,
  inspectHour = 12,
}) {
  const nowMs = now.getTime();
  const dayStart = shanghaiDayStart(nowMs);
  const todayRuns = runs.filter((r) => {
    const t = runTime(r);
    return t >= dayStart && t < dayStart + 86400000;
  });

  const hasSuccess = todayRuns.some((r) => r.conclusion === 'success');
  const running = todayRuns.find((r) => ACTIVE_STATUSES.has(r.status));
  const failed = todayRuns.some((r) => r.conclusion === 'failure');
  const minuteOfDay = shanghaiMinuteOfDay(nowMs);

  const needRepair = workflowState !== 'active';

  if (needRepair) {
    return {
      needRepair: true,
      needDispatch: false,
      needAlert: false,
      reason: `工作流状态异常：${workflowState}，需启用`,
    };
  }

  if (hasSuccess) {
    return { needRepair: false, needDispatch: false, needAlert: false, reason: '今日已有成功运行' };
  }

  if (running) {
    return {
      needRepair: false,
      needDispatch: false,
      needAlert: false,
      reason: `今日已有运行中任务（${running.status}），等待其完成`,
    };
  }

  const pastGrace = minuteOfDay >= scheduledHour * 60 + graceMin;

  if (mode === 'preflight') {
    return {
      needRepair: false,
      needDispatch: pastGrace,
      needAlert: false,
      reason: pastGrace
        ? `已过计划点 ${scheduledHour}:00 宽限 ${graceMin} 分钟且今日无运行，需补跑`
        : `未到计划点 ${scheduledHour}:00 宽限窗口，等待定时任务`,
    };
  }

  const pastInspect = minuteOfDay >= inspectHour * 60;

  if (!pastInspect) {
    return { needRepair: false, needDispatch: false, needAlert: false, reason: `未到巡检时间 ${inspectHour}:00` };
  }

  return {
    needRepair: false,
    needDispatch: pastGrace,
    needAlert: true,
    reason:
      todayRuns.length === 0
        ? `${inspectHour}:00 前今日没有任何运行记录`
        : `${inspectHour}:00 前今日无成功运行${failed ? '（存在失败记录）' : ''}`,
  };
}
