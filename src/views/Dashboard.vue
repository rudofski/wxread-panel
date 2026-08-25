<template>
  <div class="dashboard">
    <h2 class="page-title">📊 运行状态</h2>

    <div class="status-grid">
      <div class="card status-card"><div class="card-title">项目接口</div><div class="status-body"><span class="status-dot" :class="repoClass"></span><span>{{ repoStatusText }}</span></div></div>
      <div class="card status-card"><div class="card-title">微信读书</div><div class="status-body"><span class="status-dot" :class="wereadClass"></span><span>{{ wereadStatusText }}</span></div></div>
      <div class="card status-card"><div class="card-title">推送接口</div><div class="status-body"><span class="status-dot" :class="pushClass"></span><span>{{ pushStatusText }}</span></div></div>
    </div>

    <div class="card">
      <div class="card-title">📋 最近运行</div>
      <div v-if="loadingRuns" class="empty">加载中...</div>
      <div v-else-if="dateAxis.length === 0" class="empty">暂无运行记录</div>
      <div v-else class="runs-axis">
        <div v-for="day in dateAxis" :key="day.date" class="run-day">
          <div class="run-day-label">{{ day.label }}</div>
          <div class="run-day-body">
            <div v-for="run in day.runs" :key="run.id" class="run-item" :title="run.name">
              <span class="run-dot" :class="dotClass(run)"></span>
              <span class="run-time">{{ formatTime(run.created_at) }}</span>
              <span class="run-duration">{{ formatDuration(run) }}</span>
            </div>
            <div v-if="day.runs.length === 0" class="run-empty">-</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card card-calendar">
      <div class="card-title">📅 运行日历</div>
      <div class="contrib-scroll">
        <div class="contrib">
          <div class="contrib-body" :style="{ '--total-cols': totalCols }">
            <div v-for="(group, gi) in monthGroups" :key="gi" class="month-group" :style="{ '--cols': group.weeks.length }">
              <div class="group-label">{{ MONTHS[group.month] }}</div>
              <div class="group-weeks">
                <div v-for="(week, wi) in group.weeks" :key="wi" class="week-col">
                  <div v-for="(cell, ci) in week" :key="ci" class="contrib-cell" :class="'cell-' + cell.s" :title="cell.title"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { listWorkflowRuns, type RunInfo } from '@/api/github';
import { groupRunsByLocalDay, daysForWidth, localDateKey } from '@/utils/runGrouping';
import { classifyRun, pickDayStatus } from '@/utils/runStatus';
import { buildMonthBlocks, type CalendarMonthBlock, type DayStatus } from '@/utils/calendarGrid';

const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]);
const loadingRuns = ref(false);

const repoClass = computed(() => settings.repoStatus === 'connected' ? 'ok' : settings.repoStatus === 'connecting' ? 'warning' : 'error');
const repoStatusText = computed(() => {
  if (settings.repoStatus === 'connected') return `已连接 ${settings.repoInfo?.fullName}`;
  if (settings.repoStatus === 'connecting') return '连接中...';
  if (settings.repoStatus === 'error') return settings.repoMessage || '未连接';
  return '请先配置仓库地址';
});
// GitHub Secrets 的明文不可读，但可通过 API 检测存在性（打开面板自动回读刷新）
const wereadClass = computed(() => settings.remoteSecrets['WXREAD_CURL_BASH'] || settings.curlBash ? 'ok' : 'warning');
const wereadStatusText = computed(() => {
  if (settings.remoteSecrets['WXREAD_CURL_BASH']) return '已配置（远程 Secrets）';
  if (settings.curlBash) return '已填入（尚未保存到远程）';
  return '未配置，请到配置页获取并保存';
});
const pushClass = computed(() => settings.remoteSecrets['WXPUSHER_SPT'] || settings.wxpusherToken ? 'ok' : 'warning');
const pushStatusText = computed(() => {
  if (settings.remoteSecrets['WXPUSHER_SPT']) return '已配置（远程 Secrets）';
  if (settings.wxpusherToken) return '已填入（尚未保存到远程）';
  return '未配置，请到配置页设置';
});

// 最近运行：以日期为横轴（左早右近），每日内竖向排列多条记录。
// v0.1.7：日期按【本地时区】归组（与时间显示同源，修复凌晨运行串日）；
// 天数随窗口宽度响应（窄屏 7 天 / 中屏 10 天 / 宽屏 14 天），保证最新日期完整显示。
const DAYS = ref(daysForWidth(window.innerWidth));
function onResize() { DAYS.value = daysForWidth(window.innerWidth); }
const dateAxis = computed(() => groupRunsByLocalDay(runs.value, DAYS.value));

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
// 运行状态只用圆点图标表达（绿=成功 / 红=失败 / 蓝=运行中 / 灰=其他）
// 判定统一走 classifyRun（与运行日历同源，保证两处状态完全同步）
const DOT_CLASS = { running: 'running', success: 'ok', failure: 'error', idle: 'idle' } as const;
function dotClass(run: RunInfo): string {
  return DOT_CLASS[classifyRun(run)];
}
// 阅读时长 = 运行耗时（updated_at - run_started_at），如 30 分钟 / 12分30秒
function formatDuration(run: RunInfo): string {
  if (run.status === 'in_progress' || !run.run_started_at) return '···';
  const start = new Date(run.run_started_at).getTime();
  const end = run.updated_at ? new Date(run.updated_at).getTime() : Date.now();
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
}

async function loadRecentRuns() {
  if (!settings.repoInfo) return;
  loadingRuns.value = true;
  try { runs.value = await listWorkflowRuns(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId, 50); }
  catch {} finally { loadingRuns.value = false; }
}

async function loadCalendarRuns() {
  if (!settings.repoInfo) return;
  try { calRuns.value = await listWorkflowRuns(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId, 365); }
  catch {}
}

// ---- 运行日历（与 Calendar.vue 同源逻辑）----
const calRuns = ref<RunInfo[]>([]);
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const calDayMap = computed(() => {
  const byDay = new Map<string, RunInfo[]>();
  for (const run of calRuns.value) {
    const date = localDateKey(run.run_started_at || run.created_at);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date)!.push(run);
  }
  const map = new Map<string, DayStatus>();
  for (const [date, dayRuns] of byDay) {
    const win = pickDayStatus(dayRuns)!;
    const s = classifyRun(win);
    map.set(date, { s });
  }
  return map;
});

const monthGroups = computed<CalendarMonthBlock[]>(() =>
  buildMonthBlocks(new Date().getFullYear(), calDayMap.value, new Date()),
);

const totalCols = computed(() => monthGroups.value.reduce((sum, g) => sum + g.weeks.length, 0));

onMounted(() => {
  loadRecentRuns();
  loadCalendarRuns();
  window.addEventListener('resize', onResize);
});
onUnmounted(() => { window.removeEventListener('resize', onResize); });
</script>

<style scoped>
.dashboard { max-width: 100%; display: flex; flex-direction: column; min-height: calc(100vh - 48px); gap: 16px; }
.status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.status-card .status-body { display: flex; align-items: center; gap: 8px; font-size: 15px; }
/* 横向铺满；窄屏时横向滚动兜底，每列保证可读（最新日期不截断） */
.runs-axis { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.run-day { flex: 1 1 0; min-width: 78px; border-radius: 6px; background: #f9f9f9; padding: 8px; }
.run-day-label { text-align: center; font-size: 12px; color: var(--color-text-light); padding-bottom: 6px; border-bottom: 1px solid var(--color-border); margin-bottom: 6px; white-space: nowrap; }
.run-day-body { display: flex; flex-direction: column; gap: 6px; min-height: 24px; }
.run-item { display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; }
.run-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.run-dot.ok { background: var(--color-success); }
.run-dot.error { background: var(--color-danger); }
.run-dot.running { background: var(--color-primary); animation: run-pulse 1s ease-in-out infinite; }
.run-dot.idle { background: #ccc; }
@keyframes run-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.run-time { color: var(--color-text-light); font-size: 11px; }
.run-duration { font-size: 11px; color: var(--color-text-light); }
.run-empty { text-align: center; color: #ddd; font-size: 12px; }

/* 运行日历（与 Calendar.vue 一致） */
.contrib-scroll { overflow-x: auto; }
.contrib { width: 100%; min-width: 720px; }
.contrib-body { display: grid; grid-template-columns: repeat(var(--total-cols), minmax(0, 1fr)); gap: 3px; }
.month-group { grid-column: span var(--cols); display: flex; flex-direction: column; }
.month-group + .month-group { border-left: 2px solid rgba(0, 0, 0, 0.1); padding-left: 4px; }
.group-label { height: 22px; line-height: 22px; font-size: 12px; font-weight: 600; color: var(--color-text-light); white-space: nowrap; }
.group-weeks { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 3px; }
.week-col { display: flex; flex-direction: column; gap: 3px; }
.contrib-cell { aspect-ratio: 1 / 1; border-radius: 3px; }
.cell-success { background: #216e39; }
.cell-failure { background: #cf222e; }
.cell-running { background: var(--color-primary); animation: cell-pulse 1s ease-in-out infinite; }
.cell-idle { background: #9aa0a6; }
@keyframes cell-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.cell-empty { background: #ebedf0; }
.cell-future { background: transparent; border: 1px solid #ebedf0; }
.cell-blank { background: transparent; }

.card-calendar { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.card-calendar > .card-title { flex-shrink: 0; }
.card-calendar > .contrib-scroll { flex: 1; min-height: 0; }
</style>
