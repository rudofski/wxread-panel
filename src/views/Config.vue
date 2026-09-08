<template>
  <div class="config-page">
    <div class="config-header">
      <h2 class="page-title">⚙️ 配置参数</h2>
      <div class="header-actions">
        <button class="btn btn-primary" @click="save" :disabled="saving">{{ saving ? '保存中...' : '💾 保存全部配置' }}</button>
        <button class="btn btn-primary" @click="runNow" :disabled="running || !settings.repoInfo">{{ running ? '运行中...' : '▶ 立即运行' }}</button>
        <span v-if="saveMsg" class="save-msg" :class="saveOk ? 'ok' : 'error'">{{ saveMsg }}</span>
      </div>
    </div>
    <div class="config-grid">
      <RepoInput />
      <LoginConfig />
      <PushConfig />
      <ReadConfig />
      <ScheduleCard />
      <CurlHelperCard />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RepoInput from '@/components/config/RepoInput.vue';
import LoginConfig from '@/components/config/LoginConfig.vue';
import PushConfig from '@/components/config/PushConfig.vue';
import ReadConfig from '@/components/config/ReadConfig.vue';
import ScheduleCard from '@/components/config/ScheduleCard.vue';
import CurlHelperCard from '@/components/config/CurlHelperCard.vue';
import { dispatchWorkflow } from '@/api/github';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const saving = ref(false), saveMsg = ref(''), saveOk = ref(true);
const running = ref(false);
async function runNow() {
  if (!settings.repoInfo || running.value) return;
  running.value = true; saveMsg.value = '';
  try {
    await dispatchWorkflow(settings.repoInfo.owner, settings.repoInfo.repo, settings.selectedWorkflowId);
    saveMsg.value = '✅ 任务已触发'; saveOk.value = true;
  } catch (e: any) {
    saveMsg.value = `❌ ${e.message}`; saveOk.value = false;
  } finally { running.value = false; }
}
async function save() {
  saving.value = true; saveMsg.value = '';
  try { await settings.saveConfig(); saveMsg.value = '✅ 配置已保存'; saveOk.value = true; }
  catch (e: any) { saveMsg.value = `❌ ${e.message}`; saveOk.value = false; }
  finally { saving.value = false; }
}
</script>

<style scoped>
.config-page { max-width: 100%; min-width: 0; display: flex; flex-direction: column; min-height: calc(100vh - 48px); }
.config-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.config-header .page-title { margin: 0; }
.header-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; flex-wrap: wrap; }
.save-msg { font-size: 13px; }
.save-msg.ok { color: var(--color-success); }
.save-msg.error { color: var(--color-danger); }
.config-grid {
  flex: 1;
  min-width: 0;
  display: grid;
  /* min(340px, 100%)：容器小于 340px 时退化为 100%，防止单列溢出 */
  grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
  gap: 24px;
  grid-auto-rows: 1fr;
}
</style>
