<template>
  <div class="config-page"><h2 class="page-title">⚙️ 配置参数</h2>
    <RepoInput /><LoginConfig /><PushConfig /><ReadConfig />
    <div class="card"><button class="btn btn-primary btn-lg" @click="save" :disabled="saving">{{ saving ? '保存中...' : '💾 保存全部配置' }}</button><span v-if="saveMsg" class="save-msg" :class="saveOk ? 'ok' : 'error'">{{ saveMsg }}</span></div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RepoInput from '@/components/config/RepoInput.vue';
import LoginConfig from '@/components/config/LoginConfig.vue';
import PushConfig from '@/components/config/PushConfig.vue';
import ReadConfig from '@/components/config/ReadConfig.vue';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const saving = ref(false), saveMsg = ref(''), saveOk = ref(true);
async function save() {
  saving.value = true; saveMsg.value = '';
  try { await settings.saveConfig(); saveMsg.value = '✅ 配置已保存'; saveOk.value = true; }
  catch (e: any) { saveMsg.value = `❌ ${e.message}`; saveOk.value = false; }
  finally { saving.value = false; }
}
</script>

<style scoped>
.config-page { max-width: 700px; }
.btn-lg { padding: 12px 32px; font-size: 16px; }
.save-msg { margin-left: 16px; font-size: 14px; }
.save-msg.ok { color: var(--color-success); }
.save-msg.error { color: var(--color-danger); }
</style>