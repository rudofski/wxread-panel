<template>
  <div class="card"><div class="card-title">项目接口</div>
    <div class="form-group"><label class="form-label">仓库地址</label>
      <div class="input-group"><input v-model="url" class="form-input" placeholder="https://github.com/rudofski/wxread" @keyup.enter="connect" /><button class="btn btn-primary" @click="connect" :disabled="status === 'connecting'">{{ status === 'connecting' ? '检测中...' : '检测连接' }}</button></div>
    </div>
    <div v-if="status === 'connected'" class="status-msg ok">🟢 {{ message }}</div>
    <div v-else-if="status === 'error'" class="status-msg error">🔴 {{ message }}</div>
    <div v-if="status === 'connected'" class="form-group"><label class="form-label">Actions 工作流（自动发现）</label>
      <select v-if="workflows.length > 0" v-model="selectedWf" class="form-select"><option v-for="wf in workflows" :key="wf.id" :value="wf.id">{{ wf.name }} ({{ wf.path }})</option></select>
      <!-- 状态位放在 workflows.length 之外：PAT 读不到工作流列表时恰恰最需要看到「已停用」 -->
      <div class="status-msg" :class="wfView.ok ? 'ok' : 'error'">{{ wfView.text }}
        <button class="link-btn" type="button" @click="refreshWf" :disabled="refreshing">{{ refreshing ? '刷新中...' : '刷新状态' }}</button>
      </div>
      <a :href="actionsUrl" target="_blank" class="btn btn-default actions-link">📋 查看 Actions</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { describeWorkflowState } from '@/utils/workflowStatus';

const settings = useSettingsStore();
const url = ref(settings.repoUrl);
const status = ref(settings.repoStatus);
const message = ref(settings.repoMessage);
const workflows = ref(settings.workflows);
const selectedWf = ref(settings.selectedWorkflowId);
// 工作流状态位：与「🟢 已连接 owner/repo」同样式，异常时转红并给出 Enable 提示
const wfView = computed(() => describeWorkflowState(settings.workflowState, settings.workflowStateError));
const refreshing = ref(false);
async function refreshWf() {
  refreshing.value = true;
  try { await settings.refreshWorkflowState(); } finally { refreshing.value = false; }
}
// 自动与仓库地址配对，打开对应仓库的 Actions 页面
const actionsUrl = computed(() => {
  if (!settings.repoInfo) return '#';
  return `https://github.com/${settings.repoInfo.owner}/${settings.repoInfo.repo}/actions`;
});

watch(() => settings.repoStatus, v => status.value = v);
watch(() => settings.repoMessage, v => message.value = v);
watch(() => settings.workflows, v => workflows.value = v);
watch(selectedWf, v => { settings.selectedWorkflowId = v; });

async function connect() { await settings.connectRepo(url.value.trim()); }
</script>

<style scoped>
.input-group { display: flex; gap: 8px; }
.input-group .form-input { flex: 1; }
.status-msg { padding: 8px 12px; border-radius: 6px; margin-top: 8px; font-size: 13px; }
.status-msg.ok { background: #f6ffed; color: var(--color-success); }
.status-msg.error { background: #fff2f0; color: var(--color-danger); }
.actions-link { display: inline-block; margin-top: 8px; text-decoration: none; }
.link-btn { margin-left: 8px; background: none; border: none; padding: 0; font-size: 12px; color: var(--color-primary); cursor: pointer; text-decoration: underline; }
.link-btn:disabled { color: var(--color-text-secondary); cursor: default; }
</style>
