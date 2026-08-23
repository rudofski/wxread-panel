<template>
  <div class="card"><div class="card-title">微信读书接口</div>
    <div class="form-group"><label class="form-label">WXREAD_CURL_BASH（粘贴到此处）</label>
      <textarea v-model="bash" class="form-textarea" placeholder="curl 'https://weread.qq.com/web/book/read' ... -H 'x-wrpa-0: ...' --data-raw '...'" rows="5"></textarea>
      <p class="form-hint">请用 F12 方式获取（阅读页右键 read 请求 → Copy as cURL），书签工具受 HttpOnly 限制无法获取完整凭证；保存时写入 GitHub Secrets（不可回读）。</p>
    </div>
    <div class="form-group"><label class="form-label">当前状态：<span :class="bash ? 'text-ok' : 'text-warn'">{{ bash ? '🟢 已填入' : '🟡 待配置' }}</span></label></div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const bash = ref(settings.curlBash);
// 同步到 store，保存配置时才能写入 GitHub Secrets（此前缺失导致 WXREAD_CURL_BASH 从未保存）
watch(bash, v => { settings.curlBash = v; });
</script>
<style scoped>
.text-ok { color: var(--color-success); }
.text-warn { color: var(--color-warning); }
.form-hint { margin-top: 4px; font-size: 12px; color: var(--color-text-light); }
</style>
