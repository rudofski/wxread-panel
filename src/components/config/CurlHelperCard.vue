<template>
  <div class="card"><div class="card-title">📋 一键获取 curl_bash</div>
    <p class="desc">获取微信读书登录凭证（curl_bash），约 30 秒完成：</p>
    <ol class="steps">
      <li>打开 <a href="https://weread.qq.com/" target="_blank">微信读书网页版 ↗</a> 并扫码登录</li>
      <li>进入任意一本书的阅读页</li>
      <li>点击书签按钮（拖到书签栏使用），在阅读页<b>翻一页</b>，工具自动捕获并复制 curl_bash</li>
    </ol>
    <a class="btn btn-primary btn-lg btn-block" :href="helperUrl" target="_blank">📋 一键获取 curl_bash ↗</a>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
const helperUrl = computed(() => `${import.meta.env.BASE_URL}curl-helper/index.html`);
</script>
<style scoped>
.desc { font-size: 13px; margin-bottom: 8px; }
.steps { margin: 0 0 14px 20px; font-size: 13px; color: #555; line-height: 1.8; }
.btn-block { display: block; width: 100%; text-align: center; box-sizing: border-box; }
.btn-lg { padding: 10px 24px; font-size: 14px; }
</style>
