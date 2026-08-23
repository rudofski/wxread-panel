<template>
  <div class="card"><div class="card-title">登录方式</div>

    <!-- 醒目的一键获取入口 -->
    <div class="get-curl">
      <p class="get-curl-desc">首次使用需先获取微信读书登录凭证（curl_bash），约 30 秒完成：</p>
      <ol class="get-curl-steps">
        <li>打开 <a href="https://weread.qq.com/" target="_blank">微信读书网页版 ↗</a> 并扫码登录</li>
        <li>进入任意一本书的阅读页</li>
        <li>点击下方书签按钮（拖到书签栏使用），自动复制 curl_bash</li>
      </ol>
      <a class="btn btn-primary btn-lg get-curl-btn" :href="helperUrl" target="_blank">
        📋 一键获取 curl_bash ↗
      </a>
    </div>

    <div class="form-group"><label class="form-label">WXREAD_CURL_BASH（粘贴到此处）</label>
      <textarea v-model="bash" class="form-textarea" placeholder="curl 'https://weread.qq.com/web/book/read' ... -b 'wr_vid=...'" rows="4"></textarea>
      <p class="form-hint">已填入的内容仅保存在本次会话，保存配置时写入 GitHub Secrets（不可回读）。</p>
    </div>
    <div class="form-group"><label class="form-label">当前状态：<span :class="bash ? 'text-ok' : 'text-warn'">{{ bash ? '🟢 已填入' : '🟡 待配置' }}</span></label></div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const bash = ref(settings.curlBash);
const helperUrl = computed(() => `${import.meta.env.BASE_URL}curl-helper/index.html`);
// 同步到 store，保存配置时才能写入 GitHub Secrets（此前缺失导致 WXREAD_CURL_BASH 从未保存）
watch(bash, v => { settings.curlBash = v; });
</script>
<style scoped>
.get-curl {
  background: #f6f9ff;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}
.get-curl-desc { font-size: 13px; margin-bottom: 8px; }
.get-curl-steps { margin: 0 0 12px 20px; font-size: 13px; color: #555; line-height: 1.8; }
.get-curl-btn { width: 100%; justify-content: center; }
.btn-lg { padding: 12px 24px; font-size: 15px; }
.text-ok { color: var(--color-success); }
.text-warn { color: var(--color-warning); }
.form-hint { margin-top: 4px; font-size: 12px; color: var(--color-text-light); }
</style>
