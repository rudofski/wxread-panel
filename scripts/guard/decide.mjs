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
  const raw = Math.floor((ms + SHANGHAI_OFFSET_MS) / 60000) % 1440;
  return (raw + 1440) % 1440; // 负时间戳的 % 会保留符号，先归一
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
 * @param {number} [input.graceMin]         计划点后的宽限分钟（05:00+30 分 = 05:30 补跑窗口）
 * @param {number} [input.inspectHour]      巡检小时
 * @param {number} [input.staleMin]         运行超过该分钟数视为卡死
 */
export function decide({
  mode,
  now,
  workflowState,
  runs = [],
  scheduledHour = 5,
  graceMin = 30,
  inspectHour = 12,
  staleMin = 120,
}) {
  const nowMs = now.getTime();
  const dayStart = shanghaiDayStart(nowMs);
  const todayRuns = runs.filter((r) => {
    const t = runTime(r);
    return t >= dayStart && t < dayStart + 86400000;
  });

  const hasSuccess = todayRuns.some((r) => r.conclusion === 'success');
  const running = todayRuns.find((r) => ACTIVE_STATUSES.has(r.status));
  // 运行中超时视为卡死：GitHub runner 卡在 queued/in_progress 数小时是真实存在的，
  // 若把「有东西在跑」一律当正常，守护就会在最重要的场景里静默放弃告警。
  const staleRunning = running ? nowMs - runTime(running) > staleMin * 60000 : undefined;
  const healthyRunning = running && !staleRunning;
  const failed = todayRuns.some((r) => r.conclusion === 'failure');
  const minuteOfDay = shanghaiMinuteOfDay(nowMs);

  const pastGrace = minuteOfDay >= scheduledHour * 60 + graceMin;
  const pastInspect = minuteOfDay >= inspectHour * 60;

  const needRepair = workflowState !== 'active';

  if (needRepair) {
    // 停用状态下自动 enable 未必成功（PAT 权限不足、GitHub 状态刷新延迟），
    // 到巡检点必须照常告警，否则用户只能靠 job 变红邮件才知道出事。
    return {
      needRepair: true,
      needDispatch: false,
      needAlert: pastInspect,
      reason: `工作流状态异常：${workflowState}，需启用`,
    };
  }

  if (hasSuccess) {
    return { needRepair: false, needDispatch: false, needAlert: false, reason: '今日已有成功运行' };
  }

  if (mode === 'preflight') {
    return {
      needRepair: false,
      needDispatch: pastGrace && !healthyRunning,
      needAlert: false,
      reason: healthyRunning
        ? `今日已有运行中任务（${running.status}），等待其完成`
        : pastGrace
          ? `已过计划点 ${scheduledHour}:00 宽限 ${graceMin} 分钟且今日无运行，需补跑`
          : `未到计划点 ${scheduledHour}:00 宽限窗口，等待定时任务`,
    };
  }

  if (!pastInspect) {
    return {
      needRepair: false,
      needDispatch: false,
      needAlert: false,
      reason: healthyRunning
        ? `今日已有运行中任务（${running.status}），未到巡检时间 ${inspectHour}:00`
        : `未到巡检时间 ${inspectHour}:00`,
    };
  }

  // 巡检：只要今天没有成功运行就告警。运行中只是「不再补跑」的理由，不是「不告警」的理由。
  return {
    needRepair: false,
    needDispatch: pastGrace && !healthyRunning,
    needAlert: true,
    reason: staleRunning
      ? `运行中任务 ${running.status} 已超过 ${staleMin} 分钟疑似卡死，且今日无成功运行`
      : healthyRunning
        ? `${inspectHour}:00 前今日无成功运行（仍有任务在 ${running.status}）`
        : todayRuns.length === 0
          ? `${inspectHour}:00 前今日没有任何运行记录`
          : `${inspectHour}:00 前今日无成功运行${failed ? '（存在失败记录）' : ''}`,
  };
}
