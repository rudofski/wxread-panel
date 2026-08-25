<template>
  <div class="calendar-page">
    <h2 class="page-title">📅 运行日历</h2>
    <div class="card">
      <div class="card-title">运行日历</div>
      <div class="contrib-scroll">
        <div class="contrib">
          <div class="contrib-body" :style="{ '--total-cols': totalCols }">
            <div v-for="(group, gi) in monthGroups" :key="gi" class="month-group" :style="{ '--cols': group.weeks.length }">
              <div class="group-label">{{ MONTHS[group.month] }}</div>
              <div class="group-weeks">
                <div v-for="(week, wi) in group.weeks" :key="wi" class="week-col">
                  <div v-for="(cell, ci) in week" :key="ci" class="contrib-cell" :class="'cell-' + cell.s" :title="cell.title" @click="cell.date ? showDetail(cell.date) : null"></div>
                </div>
              </div>
            </div>
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
import { buildMonthBlocks, type CalendarMonthBlock, type DayStatus } from '@/utils/calendarGrid';
import { classifyRun, pickDayStatus } from '@/utils/runStatus';
import { localDateKey } from '@/utils/runGrouping';

const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]);
const selectedDate = ref<string | null>(null);
const selectedDetail = ref<{ status: string; error?: string } | null>(null);
const errorCache = ref<Map<number, string>>(new Map());

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// 每日运行状态（v0.1.8）：**成功优先**——当日只要有任意一条成功即显示成功；
// 无任何成功时取时间最新的一条。状态分类与 Dashboard 一致：success=绿 / failure=红 / running=蓝 / idle=灰
const dayMap = computed(() => {
  const byDay = new Map<string, RunInfo[]>();
  for (const run of runs.value) {
    const date = localDateKey(run.run_started_at || run.created_at);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date)!.push(run);
  }
  const map = new Map<string, DayStatus>();
  for (const [date, dayRuns] of byDay) {
    const win = pickDayStatus(dayRuns)!;
    const s = classifyRun(win);
    map.set(date, s === 'failure' ? { s, note: errorCache.value.get(win.id) || '运行失败' } : { s });
  }
  return map;
});

// 12 个月独立网格：每月 1 号在第一个格子，顺序填充，绝不跨月
const monthGroups = computed<CalendarMonthBlock[]>(() =>
  buildMonthBlocks(new Date().getFullYear(), dayMap.value, new Date()),
);

const totalCols = computed(() => monthGroups.value.reduce((sum, g) => sum + g.weeks.length, 0));

const stats = computed(() => {
  let success = 0, failure = 0;
  for (const [, v] of dayMap.value) {
    if (v.s === 'success') success++;
    else if (v.s === 'failure') failure++;
  }
  const total = success + failure;
  return { success, failure, rate: total > 0 ? Math.round((success / total) * 100) : 100 };
});

const statusText = computed(() => {
  const st = selectedDetail.value?.status;
  if (st === 'success') return '成功';
  if (st === 'running') return '运行中';
  if (st === 'idle') return '已取消/跳过';
  return '失败';
});
const statusClass = computed(() => {
  const st = selectedDetail.value?.status;
  if (st === 'success') return 'text-ok';
  if (st === 'running') return 'text-running';
  if (st === 'idle') return 'text-idle';
  return 'text-error';
});

function showDetail(dateStr: string) {
  selectedDate.value = dateStr;
  // 取当日运行记录，与 dayMap 同一策略：成功优先，无成功取最新（本地时区 key）
  const dayRuns = runs.value.filter(r => localDateKey(r.run_started_at || r.created_at) === dateStr);
  const win = pickDayStatus(dayRuns);
  if (!win) { selectedDetail.value = null; return; }
  const s = classifyRun(win);
  if (s === 'failure') {
    selectedDetail.value = { status: 'failure', error: errorCache.value.get(win.id) || '运行失败' };
  } else {
    selectedDetail.value = { status: s };
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
.contrib { width: 100%; min-width: 720px; }
/* 外层：按总列数均分容器宽度，所有格子统一大小、铺满显示区域 */
.contrib-body { display: grid; grid-template-columns: repeat(var(--total-cols), minmax(0, 1fr)); gap: 3px; }
.month-group { grid-column: span var(--cols); display: flex; flex-direction: column; }
.month-group + .month-group { border-left: 2px solid rgba(0, 0, 0, 0.1); padding-left: 4px; }
.group-label { height: 22px; line-height: 22px; font-size: 12px; font-weight: 600; color: var(--color-text-light); white-space: nowrap; }
.group-weeks { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 3px; }
.week-col { display: flex; flex-direction: column; gap: 3px; }
.contrib-cell { aspect-ratio: 1 / 1; border-radius: 3px; }
.cell-success { background: #216e39; cursor: pointer; }
.cell-failure { background: #cf222e; cursor: pointer; }
.cell-running { background: var(--color-primary); cursor: pointer; animation: cell-pulse 1s ease-in-out infinite; }
.cell-idle { background: #9aa0a6; cursor: pointer; }
@keyframes cell-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.cell-empty { background: #ebedf0; cursor: pointer; }
.cell-future { background: transparent; border: 1px solid #ebedf0; }
.cell-blank { background: transparent; }
.text-ok { color: var(--color-success); }
.text-running { color: var(--color-primary); }
.text-idle { color: #9aa0a6; }
.text-error { color: var(--color-danger); }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat-item { text-align: center; padding: 16px; border-radius: 8px; background: #f9f9f9; }
.stat-value { font-size: 32px; font-weight: 700; }
.stat-item.ok .stat-value { color: var(--color-success); }
.stat-item.error .stat-value { color: var(--color-danger); }
.stat-item .stat-value { color: var(--color-primary); }
.stat-label { font-size: 14px; color: var(--color-text-light); }
</style>
