// 运行状态统一分类（v0.1.7）：Dashboard 圆点与运行日历格子共用同一判定，
// 保证"最近运行"与"运行日历"状态完全同步。
// 四档语义与 Dashboard 一致：蓝=运行中 / 绿=成功 / 红=失败 / 灰=其他(取消/跳过/超时等)。

export type RunStatus = 'running' | 'success' | 'failure' | 'idle';

export interface RunStatusLike {
  status: string;
  conclusion: string | null;
}

export function classifyRun(run: RunStatusLike): RunStatus {
  if (run.status === 'in_progress') return 'running';
  if (run.conclusion === 'success') return 'success';
  if (run.conclusion === 'failure') return 'failure';
  return 'idle';
}
