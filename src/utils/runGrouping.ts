// 运行状态页"最近运行"横轴：按【本地时区】日期归组。
// v0.1.7 修复：旧实现用 UTC 切片切日期、用本地时区显示时间，两者不一致
// 导致凌晨运行（UTC 深夜 = 本地次日凌晨）被归到前一天。此处日期 key 与
// formatTime 显示同源，统一使用本地时区，杜绝错位。

export interface RunLike {
  run_started_at: string | null;
  created_at: string;
}

export interface RunDay<T> {
  date: string;   // YYYY-MM-DD（本地）
  label: string;  // MM-DD（界面显示）
  runs: T[];
}

/** 时间戳 → 本地时区日期 key（YYYY-MM-DD），与 formatTime 显示同源 */
export function localDateKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 按屏幕宽度决定横轴天数：窄屏减少天数，保证每列可读、最新日期完整显示 */
export function daysForWidth(width: number): number {
  if (width < 900) return 7;
  if (width < 1280) return 10;
  return 14;
}

/**
 * 把运行记录归组到以 now 为右端、共 days 天的横轴（左早右近）。
 * - 每行记录优先用 run_started_at、缺失回退 created_at，按本地日期归组
 * - 每日内多条按时间正序（早→晚）
 * - 无记录的天 runs 为空数组（界面渲染为 -）
 */
export function groupRunsByLocalDay<T extends RunLike>(runs: T[], days: number, now: Date = new Date()): RunDay<T>[] {
  const map = new Map<string, T[]>();
  for (const run of runs) {
    const key = localDateKey(run.run_started_at || run.created_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(run);
  }
  const out: RunDay<T>[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayRuns = (map.get(dateStr) || []).slice().sort((a, b) => {
      const ta = new Date(a.run_started_at || a.created_at).getTime();
      const tb = new Date(b.run_started_at || b.created_at).getTime();
      return ta - tb; // 不依赖 API 顺序，显式早→晚
    });
    out.push({
      date: dateStr,
      label: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      runs: dayRuns,
    });
  }
  return out;
}
