<template>
  <div class="calendar-page">
    <h2 class="page-title">📅 运行日历</h2>
    <div class="card">
      <div class="card-title">运行日历</div>
      <div class="contrib-scroll">
        <div class="contrib">
          <div class="contrib-body">
            <div class="weekday-col">
              <span class="weekday-spacer"></span>
              <span class="weekday">一</span><span class="weekday"></span><span class="weekday">三</span><span class="weekday"></span><span class="weekday">五</span><span class="weekday"></span><span class="weekday"></span>
            </div>
            <div v-for="(group, gi) in monthGroups" :key="gi" class="month-group">
              <div class="group-label">{{ group.month >= 0 ? MONTHS[group.month] : '' }}</div>
              <div class="group-weeks">
                <div v-for="(week, wi) in group.weeks" :key="wi" class="week-col">
                  <div v-for="cell in week" :key="cell.date" class="contrib-cell" :class="'cell-' + cell.s" :title="cell.title" @click="showDetail(cell.date)"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="legend">
            <span class="legend-cell cell-empty"></span><span>无记录</span>
            <span class="legend-cell cell-success"></span><span>成功</span>
            <span class="legend-cell cell-failure"></span><span>失败</span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="selectedDate" class="card">
      <div class="card-title">{{ selectedDate }} 详情</div>
      <div v-if="selectedDetail">
        <p><strong>状态：</strong><span :class="statusClass">{{ statusText }}</span></p>
        <p v-if="selectedDetail.error"><strong>错误：</strong>{{ selectedDetail.error }}</p>
      </div>
      <div v-else class="empty">该日期没有运行记录</div>
    </div>
    <div class="card">
      <div class="card-title">统计</div>
      <div class="stats-grid">
        <div class="stat-item ok"><div class="stat-value">{{ stats.success }}</div><div class="stat-label">成功</div></div>
        <div class="stat-item error"><div class="stat-value">{{ stats.failure }}</div><div class="stat-label">失败</div></div>
        <div class="stat-item"><div class="stat-value">{{ stats.rate }}%</div><div class="stat-label">成功率</div></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { listWorkflowRuns, parseRunError, getRunLogs, type RunInfo } from '@/api/github';

interface Cell { date: string; s: string; title: string; }
interface DayData { s: 'success' | 'failure'; note?: string; }

const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]);
const selectedDate = ref<string | null>(null);
const selectedDetail = ref<{ status: string; error?: string } | null>(null);
const errorCache = ref<Map<number, string>>(new Map());

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// 横向 GitHub 贡献图：列 = 周（52 周），行 = 周一 ~ 周日，按月分组
const weeks = computed(() => {
  const year = new Date().getFullYear();
  const start = new Date(year, 0, 1);
  // 对齐到该年第一个周一作为起点
  const mondayIndex = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - mondayIndex);

  const dayMap = new Map<string, DayData>();
  // runs 按时间倒序（最新在前），每日只取最新一条；只要最新运行结果不是失败即为绿色
  for (const run of runs.value) {
    const date = (run.run_started_at || run.created_at).slice(0, 10);
    if (dayMap.has(date)) continue;
    if (run.conclusion === 'failure') {
      dayMap.set(date, { s: 'failure', note: errorCache.value.get(run.id) || '运行失败' });
    } else if (run.status === 'in_progress') {
      dayMap.set(date, { s: 'success', note: '运行中' });
    } else {
      // success / cancelled / skipped / timed_out 等一律视为非失败 → 绿色
      dayMap.set(date, { s: 'success' });
    }
  }

  const now = new Date();
  const endOfYear = new Date(year, 11, 31);
  const result: Cell[][] = [];
  const cursor = new Date(gridStart);
  // 覆盖整年（最后一周可延伸至下一年初）
  while (cursor <= endOfYear || result.length < 52) {
    const week: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const inYear = cursor.getFullYear() === year;
      const future = inYear && cursor > now;
      const data = dayMap.get(dateStr);
      let s = 'empty';
      if (!inYear) s = 'out';
      else if (future) s = 'future';
      else if (data) s = data.s;
      let title = dateStr;
      if (data) title += data.s === 'failure' ? ` 失败${data.note ? ': ' + data.note : ''}` : data.note ? ` ${data.note}` : ' 成功';
      else title += ' 未运行';
      week.push({ date: dateStr, s, title });
      cursor.setDate(cursor.getDate() + 1);
    }
    result.push(week);
  }
  return result;
});

// 按月份分组：每周取该周首个属于本年的日期确定归属月份，月份变化时开启新组
const monthGroups = computed(() => {
  const year = new Date().getFullYear();
  const groups: { month: number; weeks: Cell[][] }[] = [];
  for (const week of weeks.value) {
    const first = week.find(c => c.date.startsWith(String(year)));
    const m = first ? Number(first.date.slice(5, 7)) - 1 : -1;
    const last = groups[groups.length - 1];
    if (!last || last.month !== m) groups.push({ month: m, weeks: [week] });
    else last.weeks.push(week);
  }
  return groups;
});

const stats = computed(() => {
  let success = 0, failure = 0;
  for (const run of runs.value) {
    if (run.conclusion === 'success') success++;
    else if (run.conclusion === 'failure') failure++;
  }
  const total = success + failure;
  return { success, failure, rate: total > 0 ? Math.round((success / total) * 100) : 100 };
});

const statusText = computed(() => {
  const st = selectedDetail.value?.status;
  if (st === 'success') return '成功';
  if (st === 'running') return '运行中';
  return '失败';
});
const statusClass = computed(() => {
  const st = selectedDetail.value?.status;
  if (st === 'success') return 'text-ok';
  if (st === 'running') return 'text-running';
  return 'text-error';
});

function showDetail(dateStr: string) {
  selectedDate.value = dateStr;
  // 取当日最新一条运行记录
  const latest = runs.value.find(r => (r.run_started_at || r.created_at).slice(0, 10) === dateStr);
  if (!latest) { selectedDetail.value = null; return; }
  if (latest.conclusion === 'failure') {
    selectedDetail.value = { status: 'failure', error: errorCache.value.get(latest.id) || '运行失败' };
  } else if (latest.status === 'in_progress') {
    selectedDetail.value = { status: 'running' };
  } else {
    selectedDetail.value = { status: 'success' };
  }
}

async function loadData() {
  if (!settings.repoInfo) return;
  try {
    runs.value = await listWorkflowRuns(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId, 365);
    for (const run of runs.value) {
      if (run.conclusion === 'failure' && !errorCache.value.has(run.id)) {
        try {
          const logs = await getRunLogs(settings.repoInfo.owner, settings.repoInfo.repo, run.id);
          const error = parseRunError(logs);
          if (error) errorCache.value.set(run.id, error);
        } catch {}
      }
    }
  } catch {}
}
onMounted(loadData);
</script>

<style scoped>
.calendar-page { max-width: 100%; }
.contrib-scroll { overflow-x: auto; }
.contrib { width: 100%; min-width: 760px; }
.contrib-body { display: flex; gap: 3px; }
.weekday-col { display: flex; flex-direction: column; gap: 3px; width: 18px; margin-right: 6px; flex-shrink: 0; }
.weekday-spacer { height: 20px; flex-shrink: 0; }
.weekday { flex: 1; font-size: 10px; color: var(--color-text-light); display: flex; align-items: center; justify-content: center; }
.month-group { display: flex; flex-direction: column; }
.month-group + .month-group { margin-left: 10px; }
.group-label { height: 20px; line-height: 20px; font-size: 11px; font-weight: 600; color: var(--color-text-light); white-space: nowrap; }
.group-weeks { display: flex; gap: 3px; flex: 1; }
.week-col { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.contrib-cell { width: 100%; aspect-ratio: 1 / 1; min-width: 14px; border-radius: 3px; cursor: pointer; }
.cell-success { background: #216e39; }
.cell-failure { background: #cf222e; }
.cell-empty { background: #ebedf0; }
.cell-future { background: transparent; border: 1px solid #ebedf0; }
.cell-out { background: transparent; }
.legend { display: flex; align-items: center; gap: 4px; margin-top: 10px; font-size: 11px; color: var(--color-text-light); }
.legend + .legend { margin-left: 12px; }
.legend-cell { width: 14px; height: 14px; border-radius: 3px; margin-left: 8px; }
.legend-cell:first-child { margin-left: 0; }
.text-ok { color: var(--color-success); }
.text-running { color: var(--color-primary); }
.text-error { color: var(--color-danger); }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat-item { text-align: center; padding: 16px; border-radius: 8px; background: #f9f9f9; }
.stat-value { font-size: 32px; font-weight: 700; }
.stat-item.ok .stat-value { color: var(--color-success); }
.stat-item.error .stat-value { color: var(--color-danger); }
.stat-item .stat-value { color: var(--color-primary); }
.stat-label { font-size: 14px; color: var(--color-text-light); }
</style>
