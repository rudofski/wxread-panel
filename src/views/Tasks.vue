<template>
  <div class="tasks-page"><h2 class="page-title">📋 任务管理</h2>

    <div class="card"><div class="card-title">操作</div>
      <div class="actions-row"><button class="btn btn-primary" :disabled="isRunning || !canRun" @click="runNow">{{ isRunning ? '运行中...' : '立即运行' }}</button><span v-if="!settings.repoInfo" class="hint">请先连接仓库</span><span v-else-if="settings.selectedBooks.length === 0" class="hint">请先选择书籍</span></div>
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
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { dispatchWorkflow, listWorkflowRuns, getOctokit, type RunInfo } from '@/api/github';
const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]), loadingRuns = ref(false), isRunning = ref(false);
const canRun = computed(() => !!settings.repoInfo && settings.selectedBooks.length > 0);
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
onMounted(loadRuns);
</script>

<style scoped>
.tasks-page { max-width: 700px; }
.actions-row { display: flex; align-items: center; gap: 12px; }
.hint { font-size: 13px; color: var(--color-text-light); }
.run-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.run-item:last-child { border-bottom: none; }
.run-detail { flex: 1; }
.run-meta { font-size: 12px; color: var(--color-text-light); }
.run-actions { flex-shrink: 0; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
</style>