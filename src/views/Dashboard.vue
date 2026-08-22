<template>
  <div class="dashboard">
    <h2 class="page-title">📊 仪表盘</h2>

    <div class="card">
      <div class="card-title">🔗 控制入口</div>
      <div class="entry-url"><code>{{ panelUrl }}</code><button class="btn btn-default btn-sm" @click="copyUrl">📋 复制</button></div>
    </div>

    <div class="status-grid">
      <div class="card status-card"><div class="card-title">项目接口</div><div class="status-body"><span class="status-dot" :class="repoClass"></span><span>{{ repoStatusText }}</span></div></div>
      <div class="card status-card"><div class="card-title">微信读书</div><div class="status-body"><span class="status-dot" :class="wereadClass"></span><span>{{ wereadStatusText }}</span></div></div>
      <div class="card status-card"><div class="card-title">推送接口</div><div class="status-body"><span class="status-dot" :class="pushClass"></span><span>{{ pushStatusText }}</span></div></div>
    </div>

    <div class="card">
      <div class="card-title">📋 最近运行</div>
      <div v-if="recentRuns.length === 0" class="empty">暂无运行记录</div>
      <div v-for="run in recentRuns" :key="run.id" class="run-item">
        <span class="run-status">{{ run.conclusion === 'success' ? '🟢' : run.conclusion === 'failure' ? '🔴' : '🔄' }}</span>
        <span class="run-time">{{ formatDate(run.created_at) }}</span>
        <span class="run-name">{{ run.name }}</span>
        <span v-if="run.conclusion === 'failure'" class="run-error">失败</span>
        <span v-else-if="run.conclusion === 'success'" class="run-ok">成功</span>
        <span v-else class="run-pending">运行中</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">⏱️ 快捷操作</div>
      <div class="quick-actions">
        <button class="btn btn-primary" @click="$router.push('/tasks')">▶ 立即运行</button>
        <button class="btn btn-default" @click="$router.push('/config')">⚙️ 配置</button>
        <button class="btn btn-default" @click="$router.push('/books')">📚 书城选书</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { listWorkflowRuns, type RunInfo } from '@/api/github';

const settings = useSettingsStore();
const recentRuns = ref<RunInfo[]>([]);
const panelUrl = computed(() => window.location.origin + '/wxread-panel/');
const repoClass = computed(() => settings.repoStatus === 'connected' ? 'ok' : settings.repoStatus === 'connecting' ? 'warning' : 'error');
const repoStatusText = computed(() => {
  if (settings.repoStatus === 'connected') return `已连接 ${settings.repoInfo?.fullName}`;
  if (settings.repoStatus === 'connecting') return '连接中...';
  if (settings.repoStatus === 'error') return settings.repoMessage || '未连接';
  return '请先配置仓库地址';
});
const wereadClass = computed(() => settings.curlBash ? 'ok' : 'warning');
const wereadStatusText = computed(() => settings.curlBash ? '已配置' : '未配置登录信息');
const pushClass = computed(() => settings.wxpusherToken ? 'ok' : 'warning');
const pushStatusText = computed(() => settings.wxpusherToken ? '已配置' : '尚未配置推送');

function copyUrl() { navigator.clipboard.writeText(panelUrl.value); }
function formatDate(dateStr: string): string { return new Date(dateStr).toLocaleString('zh-CN'); }

async function loadRecentRuns() {
  if (!settings.repoInfo) return;
  try { recentRuns.value = await listWorkflowRuns(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId, 5); } catch {}
}
onMounted(loadRecentRuns);
</script>

<style scoped>
.dashboard { max-width: 900px; }
.entry-url { display: flex; align-items: center; gap: 12px; }
.entry-url code { background: #f5f7fa; padding: 8px 16px; border-radius: 6px; font-size: 14px; flex: 1; word-break: break-all; }
.btn-sm { padding: 4px 12px; font-size: 13px; }
.status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
.status-card .status-body { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.run-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.run-item:last-child { border-bottom: none; }
.run-status { font-size: 18px; }
.run-time { color: var(--color-text-light); font-size: 13px; min-width: 140px; }
.run-name { flex: 1; }
.run-ok { color: var(--color-success); }
.run-error { color: var(--color-danger); }
.run-pending { color: var(--color-primary); }
.quick-actions { display: flex; gap: 12px; }
</style>