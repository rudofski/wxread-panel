<template>
  <div class="card"><div class="card-title">登录方式</div>
    <div class="form-group"><label class="form-label">WXREAD_CURL_BASH</label><textarea v-model="bash" class="form-textarea" placeholder="粘贴 curl_bash 命令..." rows="4"></textarea></div>
    <div class="form-group"><label class="form-label">当前状态：<span :class="bash ? 'text-ok' : 'text-warn'">{{ bash ? '已填入' : '待配置' }}</span></label></div>
    <div class="login-actions"><a class="btn btn-default" href="/wxread-panel/curl-helper/index.html" target="_blank">打开 curl_bash 获取工具</a></div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const bash = ref(settings.curlBash);
</script>
<style scoped>
.login-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.text-ok { color: var(--color-success); }
.text-warn { color: var(--color-warning); }
</style>