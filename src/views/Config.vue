<template>
  <div class="config-page">
    <div class="config-header">
      <h2 class="page-title">⚙️ 配置参数</h2>
      <div class="header-actions">
        <button class="btn btn-primary" @click="save" :disabled="saving">{{ saving ? '保存中...' : '💾 保存全部配置' }}</button>
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
.config-page { max-width: 100%; }
.config-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.config-header .page-title { margin: 0; }
.header-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.save-msg { font-size: 13px; }
.save-msg.ok { color: var(--color-success); }
.save-msg.error { color: var(--color-danger); }
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  align-items: stretch;
}
/* 缩短卡片高度与内部间距，让所有模块在一屏内尽量可见 */
.config-grid :deep(.card) { margin-bottom: 0; padding: 12px 14px; }
.config-grid :deep(.form-group) { margin-bottom: 8px; }
.config-grid :deep(.form-textarea) { min-height: 0; }
</style>
