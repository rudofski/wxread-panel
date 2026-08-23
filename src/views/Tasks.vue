<template>
  <div class="tasks-page"><h2 class="page-title">📋 任务管理</h2>

    <div class="card"><div class="card-title">定时任务</div>
      <div class="form-group"><label class="form-label schedule-toggle"><input type="checkbox" v-model="schedule.enabled" /> 启用每日定时运行</label></div>
      <div v-if="schedule.enabled" class="schedule-settings">
        <label class="form-label">运行时间</label>
        <input type="time" v-model="schedule.time" class="form-input" style="width: 160px;" />
        <span class="timezone">时区：Asia/Shanghai (UTC+8)</span>
      </div>
      <div class="schedule-actions">
        <button class="btn btn-default" @click="saveScheduleSetting">💾 保存定时设置</button>
        <span v-if="scheduleMsg" class="save-msg" :class="scheduleOk ? 'ok' : 'error'">{{ scheduleMsg }}</span>
      </div>
      <p class="form-hint">定时执行由 wxread 仓库的 GitHub Actions schedule(cron) 控制，此设置仅作面板记录与提醒。</p>
    </div>

    <div class="card"><div class="card-title">操作</div>
      <div class="actions-row"><button class="btn btn-primary" :disabled="isRunning || !canRun" @click="runNow">{{ isRunning ? '运行中...' : '立即运行' }}</button><span v-if="!settings.repoInfo" class="hint">请先在配置页连接仓库</span></div>
    </div>

    <div class="card"><div class="card-title">运行历史</div>
      <div v-if="loadingRuns" class="empty">加载中...</div>
      <div v-else-if="runs.length === 0" class="empty">暂无运行记录</div>
      <div v-for="run in runs" :key="run.id" class="run-item">
        <span>{{ run.status === 'in_progress' ? '🔄' : run.conclusion === 'success' ? '🟢' : run.conclusion === 'failure' ? '🔴' : '⚪' }}</span>
        <div class="run-detail"><div>#{{ run.id }} {{ run.name }}</div><div class="run-meta">{{ formatDate(run.created_at) }}</div></div>
        <div class="run-actions">
          <button v-if="run.status === 'in_progress'" class="btn btn-danger btn-sm" @click="stopRun(run.id)">停止</button>
          <button v-else class="btn btn-danger btn-sm" @click="deleteRun(run.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { dispatchWorkflow, listWorkflowRuns, getOctokit, type RunInfo } from '@/api/github';
import { loadSchedule, saveSchedule, type Schedule } from '@/utils/schedule';
const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]), loadingRuns = ref(false), isRunning = ref(false);
const schedule = ref<Schedule>({ enabled: false, time: '08:00' });
const scheduleMsg = ref(''), scheduleOk = ref(true);
function saveScheduleSetting() {
  try {
    saveSchedule(schedule.value);
    scheduleMsg.value = '✅ 定时设置已保存'; scheduleOk.value = true;
  } catch (e: any) {
    scheduleMsg.value = `❌ ${e.message}`; scheduleOk.value = false;
  }
}
const canRun = computed(() => !!settings.repoInfo);
async function loadRuns() {
  if (!settings.repoInfo) return;
  loadingRuns.value = true;
  try { runs.value = await listWorkflowRuns(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId, 20); isRunning.value = runs.value.some(r => r.status === 'in_progress'); }
  catch {} finally { loadingRuns.value = false; }
}
async function runNow() {
  if (!settings.repoInfo) return;
  try { await dispatchWorkflow(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId); alert('任务已触发'); setTimeout(loadRuns, 3000); }
  catch (e: any) { alert('触发失败：' + e.message); }
}
async function stopRun(runId: number) {
  if (!settings.repoInfo) return;
  try { const c = getOctokit(); await c.rest.actions.cancelWorkflowRun({ owner: settings.repoInfo.owner, repo: settings.repoInfo.repo, run_id: runId }); loadRuns(); }
  catch (e: any) { alert('停止失败：' + e.message); }
}
async function deleteRun(runId: number) {
  if (!settings.repoInfo) return;
  try { const c = getOctokit(); await c.rest.actions.deleteWorkflowRun({ owner: settings.repoInfo.owner, repo: settings.repoInfo.repo, run_id: runId }); runs.value = runs.value.filter(r => r.id !== runId); }
  catch (e: any) { alert('删除失败：' + e.message); }
}
function formatDate(d: string): string { return new Date(d).toLocaleString('zh-CN'); }
let pollTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  loadRuns();
  schedule.value = loadSchedule();
  pollTimer = setInterval(loadRuns, 15000);
});
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });
</script>

<style scoped>
.tasks-page { max-width: 700px; }
.actions-row { display: flex; align-items: center; gap: 12px; }
.hint { font-size: 13px; color: var(--color-text-light); }
.schedule-toggle { font-weight: 500; }
.schedule-settings { margin-top: 12px; padding: 12px; background: #f9f9f9; border-radius: 6px; }
.timezone { display: block; margin-top: 4px; font-size: 12px; color: var(--color-text-light); }
.schedule-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.save-msg { font-size: 13px; }
.save-msg.ok { color: var(--color-success); }
.save-msg.error { color: var(--color-danger); }
.run-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.run-item:last-child { border-bottom: none; }
.run-detail { flex: 1; }
.run-meta { font-size: 12px; color: var(--color-text-light); }
.run-actions { flex-shrink: 0; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
</style>