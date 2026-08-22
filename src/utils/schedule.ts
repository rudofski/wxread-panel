// 定时任务设置：面板侧通过 localStorage 保存偏好，
// 实际定时执行由 wxread 仓库的 GitHub Actions schedule(cron) 控制。

const STORAGE_KEY = 'wxread_schedule';
const DEFAULT_TIME = '08:00';

export interface Schedule {
  enabled: boolean;
  time: string; // HH:MM
}

export function isValidSchedule(s: Schedule): boolean {
  if (!s || typeof s.enabled !== 'boolean') return false;
  if (typeof s.time !== 'string') return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time);
}

export function loadSchedule(): Schedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, time: DEFAULT_TIME };
    const parsed = JSON.parse(raw);
    if (!isValidSchedule(parsed)) return { enabled: false, time: DEFAULT_TIME };
    return parsed;
  } catch {
    return { enabled: false, time: DEFAULT_TIME };
  }
}

export function saveSchedule(s: Schedule): void {
  if (!isValidSchedule(s)) throw new Error('定时设置无效：时间需为 HH:MM 格式');
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
