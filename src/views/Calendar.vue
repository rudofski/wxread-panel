<template>
  <div class="calendar-page">
    <h2 class="page-title">📅 运行日历</h2>
    <div class="card">
      <div class="card-title">运行日历</div>
      <div class="contrib-scroll">
        <div class="contrib">
          <div class="month-row">
            <span class="corner"></span>
            <span v-for="(m, i) in monthLabels" :key="i" class="month-label" :class="{ 'month-visible': m }">{{ m || '' }}</span>
          </div>
          <div class="contrib-body">
            <div class="weekday-col">
              <span class="weekday">一</span><span class="weekday"></span><span class="weekday">三</span><span class="weekday"></span><span class="weekday">五</span><span class="weekday"></span><span class="weekday"></span>
            </div>
            <div v-for="(week, wi) in weeks" :key="wi" class="week-col">
              <div v-for="cell in week" :key="cell.date" class="contrib-cell" :class="'cell-' + cell.s" :title="cell.title" @click="showDetail(cell.date)"></div>
            </div>
          </div>
          <div class="legend">
            <span class="legend-cell cell-empty"></span>
            <span class="legend-cell cell-success"></span>
            <span class="legend-cell cell-failure"></span>
            <span class="legend-cell cell-running"></span>
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

const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]);
const selectedDate = ref<string | null>(null);
const selectedDetail = ref<{ status: string; error?: string } | null>(null);
const errorCache = ref<Map<number, string>>(new Map());

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// 横向 GitHub 贡献图：列 = 周（52 周），行 = 周一 ~ 周日
const weeks = computed(() => {
  const year = new Date().getFullYear();
  const start = new Date(year, 0, 1);
  // 对齐到该年第一个周一作为起点
  const mondayIndex = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - mondayIndex);

  const dayMap = new Map<string, { s: string; error?: string }>();
  // runs 按时间倒序（最新在前），只记录每日最早遇到的（即最新）一条，避免被更早记录覆盖
  for (const run of runs.value) {
    const date = (run.run_started_at || run.created_at).slice(0, 10);
    if (dayMap.has(date)) continue;
    if (run.status === 'in_progress') dayMap.set(date, { s: 'running' });
    else if (run.conclusion === 'success') dayMap.set(date, { s: 'success' });
    else if (run.conclusion === 'failure') {
      dayMap.set(date, { s: 'failure', error: errorCache.value.get(run.id) || '运行失败' });
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
      if (data) title += data.s === 'success' ? ' 成功' : data.s === 'failure' ? ` 失败${data.error ? ': ' + data.error : ''}` : ' 运行中';
      else title += ' 未运行';
      week.push({ date: dateStr, s, title });
      cursor.setDate(cursor.getDate() + 1);
    }
    result.push(week);
  }
  return result;
});

// 月份标签：每周取该周首个属于本年的日期，仅在月份变化时显示
const monthLabels = computed<(string | null)[]>(() => {
  const year = new Date().getFullYear();
  let last = -1;
  return weeks.value.map(week => {
    const first = week.find(c => c.date.startsWith(String(year)));
    if (!first) return null;
    const m = Number(first.date.slice(5, 7)) - 1;
    if (m === last) return null;
    last = m;
    return MONTHS[m];
  });
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

const statusText = computed(() => selectedDetail.value?.status === 'success' ? '成功' : '失败');
const statusClass = computed(() => selectedDetail.value?.status === 'success' ? 'text-ok' : 'text-error');

function showDetail(dateStr: string) {
  selectedDate.value = dateStr;
  const dayRuns = runs.value.filter(r => (r.run_started_at || r.created_at).slice(0, 10) === dateStr);
  const failure = dayRuns.find(r => r.conclusion === 'failure');
  if (failure) {
    selectedDetail.value = { status: 'failure', error: errorCache.value.get(failure.id) || '运行失败' };
    return;
  }
  const success = dayRuns.find(r => r.conclusion === 'success');
  if (success) { selectedDetail.value = { status: 'success' }; return; }
  const running = dayRuns.find(r => r.status === 'in_progress');
  if (running) { selectedDetail.value = { status: 'running' }; return; }
  selectedDetail.value = null;
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
.contrib { min-width: 640px; }
.month-row { display: flex; margin-left: 28px; }
.corner { width: 28px; flex-shrink: 0; }
.month-label { width: 13px; margin-right: 2px; font-size: 10px; color: var(--color-text-light); white-space: nowrap; overflow: visible; }
.month-visible { font-size: 10px; }
.contrib-body { display: flex; gap: 2px; }
.weekday-col { display: flex; flex-direction: column; gap: 2px; width: 16px; margin-right: 4px; }
.weekday { height: 12px; font-size: 9px; color: var(--color-text-light); line-height: 12px; }
.week-col { display: flex; flex-direction: column; gap: 2px; }
.contrib-cell { width: 12px; height: 12px; border-radius: 2px; cursor: pointer; }
.cell-success { background: #216e39; }
.cell-failure { background: #cf222e; }
.cell-running { background: #0969da; }
.cell-empty { background: #ebedf0; }
.cell-future { background: transparent; border: 1px solid #ebedf0; }
.cell-out { background: transparent; }
.legend { display: flex; align-items: center; gap: 4px; margin-top: 8px; margin-left: 28px; font-size: 11px; color: var(--color-text-light); }
.legend-cell { width: 12px; height: 12px; border-radius: 2px; }
.text-ok { color: var(--color-success); }
.text-error { color: var(--color-danger); }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat-item { text-align: center; padding: 16px; border-radius: 8px; background: #f9f9f9; }
.stat-value { font-size: 32px; font-weight: 700; }
.stat-item.ok .stat-value { color: var(--color-success); }
.stat-item.error .stat-value { color: var(--color-danger); }
.stat-item .stat-value { color: var(--color-primary); }
.stat-label { font-size: 14px; color: var(--color-text-light); }
</style>
