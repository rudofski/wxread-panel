<template>
  <div class="card"><div class="card-title">项目接口</div>
    <div class="form-group"><label class="form-label">仓库地址</label>
      <div class="input-group"><input v-model="url" class="form-input" placeholder="https://github.com/rudofski/wxread" @keyup.enter="connect" /><button class="btn btn-primary" @click="connect" :disabled="status === 'connecting'">{{ status === 'connecting' ? '检测中...' : '🔍 检测连接' }}</button></div>
    </div>
    <div v-if="status === 'connected'" class="status-msg ok">🟢 {{ message }}</div>
    <div v-else-if="status === 'error'" class="status-msg error">🔴 {{ message }}</div>
    <div v-if="status === 'connected' && workflows.length > 0" class="form-group"><label class="form-label">Actions 工作流（自动发现）</label>
      <select v-model="selectedWf" class="form-select"><option v-for="wf in workflows" :key="wf.id" :value="wf.id">{{ wf.name }} ({{ wf.path }})</option></select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
const url = ref(settings.repoUrl);
const status = ref(settings.repoStatus);
const message = ref(settings.repoMessage);
const workflows = ref(settings.workflows);
const selectedWf = ref(settings.selectedWorkflowId);

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
</style>