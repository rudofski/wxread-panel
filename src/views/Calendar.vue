<template>
  <div class="calendar-page"><h2 class="page-title">📅 运行日历</h2>
    <div class="card"><div class="card-title">年度热力图</div><div class="heatmap-simple">
      <div v-for="row in heatmapGrid" :key="row.label" class="heatmap-row">
        <span class="heatmap-label">{{ row.label }}</span>
        <div class="heatmap-cells"><span v-for="cell in row.cells" :key="cell.key" class="heatmap-cell" :class="'cell-' + cell.s" :title="cell.title"></span></div>
      </div>
    </div></div>
    <div v-if="selectedDate" class="card"><div class="card-title">{{ selectedDate }} 详情</div>
      <div v-if="selectedDetail"><p><strong>状态：</strong><span :class="statusClass">{{ statusText }}</span></p><p v-if="selectedDetail.error"><strong>错误：</strong>{{ selectedDetail.error }}</p></div>
      <div v-else class="empty">该日期没有运行记录</div>
    </div>
    <div class="card"><div class="card-title">统计</div>
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

interface HeatCell { key: string; s: string; title: string; }

const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]);
const selectedDate = ref<string | null>(null);
const selectedDetail = ref<{ status: string; error?: string } | null>(null);
const errorCache = ref<Map<number, string>>(new Map());

const heatmapGrid = computed(() => {
  const now = new Date();
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const cellsByMonth: Map<string, HeatCell[]> = new Map();
  months.forEach(m => cellsByMonth.set(m, []));

  const dayMap = new Map<string, { s: string; error?: string }>();

  for (const run of runs.value) {
    const date = (run.run_started_at || run.created_at).slice(0, 10);
    if (run.status === 'in_progress') dayMap.set(date, { s: 'running' });
    else if (run.conclusion === 'success') dayMap.set(date, { s: 'success' });
    else if (run.conclusion === 'failure') {
      const err = errorCache.value.get(run.id);
      dayMap.set(date, { s: 'failure', error: err || '运行失败' });
    }
  }

  for (let m = 0; m < 12; m++) {
    const monthLabel = months[m];
    const daysInMonth = new Date(now.getFullYear(), m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${now.getFullYear()}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const data = dayMap.get(dateStr);
      const future = new Date(dateStr) > now;
      cellsByMonth.get(monthLabel)!.push({
        key: dateStr,
        s: future ? 'future' : data ? data.s : 'empty',
        title: dateStr + (data ? (data.s === 'success' ? ' 成功' : data.s === 'failure' ? ` 失败${data.error ? ': ' + data.error : ''}` : ' 运行中') : ' 未运行'),
      });
    }
  }

  return months.map(label => ({ label, cells: cellsByMonth.get(label)! }));
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
  const found = heatmapGrid.value.flatMap(r => r.cells).find(c => c.key === dateStr && c.s === 'failure');
  selectedDetail.value = found ? { status: 'failure', error: found.title.split(': ').slice(1).join(': ') || undefined } : null;
  if (!found) {
    const s = heatmapGrid.value.flatMap(r => r.cells).find(c => c.key === dateStr && c.s === 'success');
    if (s) selectedDetail.value = { status: 'success' };
    else selectedDetail.value = null;
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
.heatmap-simple { overflow-x: auto; }
.heatmap-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.heatmap-label { width: 36px; font-size: 11px; color: var(--color-text-light); text-align: right; padding-right: 4px; }
.heatmap-cells { display: flex; gap: 2px; flex-wrap: wrap; flex: 1; }
.heatmap-cell { width: 12px; height: 12px; border-radius: 2px; cursor: pointer; }
.cell-success { background: #216e39; }
.cell-failure { background: #cf222e; }
.cell-running { background: #0969da; }
.cell-empty { background: #ebedf0; }
.cell-future { background: transparent; border: 1px solid #ebedf0; }
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