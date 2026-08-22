<template>
  <div class="card"><div class="card-title">推送接口</div>
    <div class="form-group"><label class="form-label">推送方式</label>
      <div class="radio-group"><label v-for="method in settings.pushMethods" :key="method" class="radio-item"><input type="radio" v-model="method_" :value="method" /><span>{{ method || '不推送' }}</span></label></div>
    </div>
    <div v-if="method_ === 'wxpusher'" class="form-group"><label class="form-label">WXPUSHER_SPT</label><input v-model="token" type="password" class="form-input" placeholder="AT_xxxxxxxxxxxx" /></div>
    <div v-if="method_ === 'pushplus'" class="form-group"><label class="form-label">PUSHPLUS_TOKEN</label><input v-model="pushplusToken" type="password" class="form-input" /></div>
    <div v-if="method_ === 'telegram'" class="form-group"><label class="form-label">TELEGRAM_BOT_TOKEN</label><input v-model="tgBotToken" type="text" class="form-input" /><label class="form-label">TELEGRAM_CHAT_ID</label><input v-model="tgChatId" type="text" class="form-input" /></div>
    <div v-if="method_ === 'serverchan'" class="form-group"><label class="form-label">SERVERCHAN_SPT</label><input v-model="serverchanToken" type="password" class="form-input" /></div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const method_ = ref(settings.pushMethod);
const token = ref(settings.wxpusherToken);
const pushplusToken = ref(''), tgBotToken = ref(''), tgChatId = ref(''), serverchanToken = ref('');
watch(method_, v => { settings.pushMethod = v; });
watch(token, v => { settings.wxpusherToken = v; });
</script>
<style scoped>
.radio-group { display: flex; gap: 16px; flex-wrap: wrap; }
.radio-item { display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 14px; }
</style>