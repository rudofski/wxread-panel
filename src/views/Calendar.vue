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
import { buildMonthBlocks, type CalendarMonthBlock, type DayStatus } from '@/utils/calendarGrid';

const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]);
const selectedDate = ref<string | null>(null);
const selectedDetail = ref<{ status: string; error?: string } | null>(null);
const errorCache = ref<Map<number, string>>(new Map());

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

// 每日最新一条运行状态；只要最新运行结果不是失败即为绿色
const dayMap = computed(() => {
  const map = new Map<string, DayStatus>();
  for (const run of runs.value) {
    const date = (run.run_started_at || run.created_at).slice(0, 10);
    if (map.has(date)) continue;
    if (run.conclusion === 'failure') {
      map.set(date, { s: 'failure', note: errorCache.value.get(run.id) || '运行失败' });
    } else if (run.status === 'in_progress') {
      map.set(date, { s: 'success', note: '运行中' });
    } else {
      // success / cancelled / skipped / timed_out 等一律视为非失败 → 绿色
      map.set(date, { s: 'success' });
    }
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
.cell-empty { background: #ebedf0; cursor: pointer; }
.cell-future { background: transparent; border: 1px solid #ebedf0; }
.cell-blank { background: transparent; }
.legend { display: flex; align-items: center; gap: 4px; margin-top: 10px; font-size: 11px; color: var(--color-text-light); }
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
