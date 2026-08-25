<template>
  <div class="card"><div class="card-title">项目接口</div>
    <div class="form-group"><label class="form-label">仓库地址</label>
      <div class="input-group"><input v-model="url" class="form-input" placeholder="https://github.com/rudofski/wxread" @keyup.enter="connect" /><button class="btn btn-primary" @click="connect" :disabled="status === 'connecting'">{{ status === 'connecting' ? '检测中...' : '检测连接' }}</button></div>
    </div>
    <div v-if="status === 'connected'" class="status-msg ok">🟢 {{ message }}</div>
    <div v-else-if="status === 'error'" class="status-msg error">🔴 {{ message }}</div>
    <div v-if="status === 'connected' && workflows.length > 0" class="form-group"><label class="form-label">Actions 工作流（自动发现）</label>
      <select v-model="selectedWf" class="form-select"><option v-for="wf in workflows" :key="wf.id" :value="wf.id">{{ wf.name }} ({{ wf.path }})</option></select>
      <a :href="actionsUrl" target="_blank" class="btn btn-default actions-link">📋 查看 Actions</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
const url = ref(settings.repoUrl);
const status = ref(settings.repoStatus);
const message = ref(settings.repoMessage);
const workflows = ref(settings.workflows);
const selectedWf = ref(settings.selectedWorkflowId);
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
</style>