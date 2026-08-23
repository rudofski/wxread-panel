<template>
  <div class="dashboard">
    <h2 class="page-title">📊 仪表盘</h2>

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
              <span class="run-status">{{ run.status === 'in_progress' ? '🔄' : run.conclusion === 'success' ? '🟢' : run.conclusion === 'failure' ? '🔴' : '⚪' }}</span>
              <span class="run-time">{{ formatTime(run.created_at) }}</span>
              <span class="run-result" :class="runClass(run)">{{ runText(run) }}</span>
            </div>
            <div v-if="day.runs.length === 0" class="run-empty">-</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">⏱️ 快捷操作</div>
      <div class="quick-actions">
        <button class="btn btn-primary" :disabled="running || !settings.repoInfo" @click="runNow">{{ running ? '运行中...' : '▶ 立即运行' }}</button>
        <span v-if="!settings.repoInfo" class="hint">请先在配置页连接仓库</span>
        <span v-if="runMsg" class="save-msg" :class="runOk ? 'ok' : 'error'">{{ runMsg }}</span>
        <button class="btn btn-default" @click="$router.push('/config')">⚙️ 配置</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { dispatchWorkflow, listWorkflowRuns, type RunInfo } from '@/api/github';

const settings = useSettingsStore();
const runs = ref<RunInfo[]>([]);
const loadingRuns = ref(false);
const running = ref(false);
const runMsg = ref('');
const runOk = ref(true);

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

// 最近运行：以日期为横轴（最近 DAYS 天，左早右近），每日内竖向排列多条记录
const DAYS = 14;
const dateAxis = computed(() => {
  const map = new Map<string, RunInfo[]>();
  for (const run of runs.value) {
    const d = (run.run_started_at || run.created_at).slice(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(run);
  }
  const days: { date: string; label: string; runs: RunInfo[] }[] = [];
  const today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayRuns = (map.get(dateStr) || []).slice().reverse();
    days.push({ date: dateStr, label: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, runs: dayRuns });
  }
  return days;
});

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function runText(run: RunInfo): string {
  if (run.status === 'in_progress') return '运行中';
  if (run.conclusion === 'success') return '成功';
  if (run.conclusion === 'failure') return '失败';
  return '';
}
function runClass(run: RunInfo): string {
  if (run.status === 'in_progress') return 'running';
  if (run.conclusion === 'success') return 'ok';
  if (run.conclusion === 'failure') return 'error';
  return '';
}

async function loadRecentRuns() {
  if (!settings.repoInfo) return;
  loadingRuns.value = true;
  try { runs.value = await listWorkflowRuns(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId, 50); }
  catch {} finally { loadingRuns.value = false; }
}

async function runNow() {
  if (!settings.repoInfo || running.value) return;
  running.value = true; runMsg.value = '';
  try {
    await dispatchWorkflow(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId);
    runMsg.value = '✅ 任务已触发'; runOk.value = true;
    setTimeout(loadRecentRuns, 3000);
  } catch (e: any) {
    runMsg.value = `❌ ${e.message}`; runOk.value = false;
  } finally { running.value = false; }
}

onMounted(() => { loadRecentRuns(); });
</script>

<style scoped>
.dashboard { max-width: 100%; }
.status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
.status-card .status-body { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.runs-axis { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; }
.run-day { flex-shrink: 0; width: 86px; border-radius: 6px; background: #f9f9f9; padding: 8px; }
.run-day-label { text-align: center; font-size: 12px; color: var(--color-text-light); padding-bottom: 6px; border-bottom: 1px solid var(--color-border); margin-bottom: 6px; }
.run-day-body { display: flex; flex-direction: column; gap: 4px; min-height: 24px; }
.run-item { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.run-status { font-size: 12px; }
.run-time { color: var(--color-text-light); font-size: 11px; }
.run-result { font-size: 11px; }
.run-result.ok { color: var(--color-success); }
.run-result.error { color: var(--color-danger); }
.run-result.running { color: var(--color-primary); }
.run-empty { text-align: center; color: #ddd; font-size: 12px; }
.quick-actions { display: flex; align-items: center; gap: 12px; }
.hint { font-size: 13px; color: var(--color-text-light); }
.save-msg { font-size: 13px; }
.save-msg.ok { color: var(--color-success); }
.save-msg.error { color: var(--color-danger); }
</style>
