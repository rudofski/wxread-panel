// 运行状态统一分类（v0.1.7）：Dashboard 圆点与运行日历格子共用同一判定，
// 保证"最近运行"与"运行日历"状态完全同步。
// 四档语义与 Dashboard 一致：蓝=运行中 / 绿=成功 / 红=失败 / 灰=其他(取消/跳过/超时等)。

export type RunStatus = 'running' | 'success' | 'failure' | 'idle';

export interface RunStatusLike {
  status: string;
  conclusion: string | null;
  run_started_at?: string | null;
  created_at?: string;
}

export function classifyRun(run: RunStatusLike): RunStatus {
  if (run.status === 'in_progress') return 'running';
  if (run.conclusion === 'success') return 'success';
  if (run.conclusion === 'failure') return 'failure';
  return 'idle';
}

/**
 * 每日运行状态选择（v0.1.8）：**成功优先**——当日只要有任意一条成功即返回该成功记录；
 * 没有任何成功时才返回时间最新的一条。不依赖输入顺序。
 */
export function pickDayStatus<T extends RunStatusLike>(runs: T[]): T | null {
  if (runs.length === 0) return null;
  const success = runs.find(r => classifyRun(r) === 'success');
  if (success) return success;
  return runs.reduce((a, b) =>
    new Date(b.run_started_at || b.created_at || '').getTime() > new Date(a.run_started_at || a.created_at || '').getTime() ? b : a,
  );
}
