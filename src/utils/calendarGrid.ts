/**
 * 运行日历网格生成纯函数。
 *
 * 设计：12 个月各自独立成块，每月从 1 号开始顺序填充（不按星期对齐），
 * 每列 7 格，最后不满的列补 blank 空格子。这样每个月的第一天
 * 始终位于该月第一个格子，且日期绝不跨月。
 */

export interface CalendarCell {
  date: string; // 'YYYY-MM-DD'，空格子为 ''
  s: string; // success | failure | running | idle | empty | future | blank
  title: string;
}

export interface CalendarMonthBlock {
  month: number; // 0-11
  weeks: CalendarCell[][]; // 每列 7 格
}

// 状态与 Dashboard 圆点语义一致（v0.1.7）：success=绿 / failure=红 / running=蓝 / idle=灰
export interface DayStatus {
  s: 'success' | 'failure' | 'running' | 'idle';
  note?: string;
}

export function buildMonthBlocks(
  year: number,
  dayMap: ReadonlyMap<string, DayStatus>,
  now: Date,
): CalendarMonthBlock[] {
  const blocks: CalendarMonthBlock[] = [];
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const weeks: CalendarCell[][] = [];
    let week: CalendarCell[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const date = new Date(year, m, d);
      const future = date > now;
      const data = dayMap.get(dateStr);
      let s = 'empty';
      if (future) s = 'future';
      else if (data) s = data.s;
      let title = dateStr;
      if (data) {
        if (data.s === 'failure') title += ` 失败${data.note ? ': ' + data.note : ''}`;
        else if (data.s === 'running') title += ' 运行中';
        else if (data.s === 'idle') title += ` ${data.note || '已取消/跳过'}`;
        else title += ' 成功';
      } else {
        title += ' 未运行';
      }
      week.push({ date: dateStr, s, title });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push({ date: '', s: 'blank', title: '' });
      weeks.push(week);
    }
    blocks.push({ month: m, weeks });
  }
  return blocks;
}
