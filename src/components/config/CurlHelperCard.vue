<template>
  <div class="card"><div class="card-title">📋 一键获取 curl_bash</div>
    <p class="desc">获取微信读书登录凭证（curl_bash），<b>F12 方式最可靠</b>（含完整登录凭证）：</p>
    <ol class="steps">
      <li>打开 <a href="https://weread.qq.com/" target="_blank">微信读书网页版 ↗</a> 并扫码登录，进入任意一本书的阅读页</li>
      <li>按 <b>F12</b> → Network 标签 → 过滤框输入 <code>read</code> → 翻一页</li>
      <li>右键 <code>read</code> 请求 → <b>Copy → Copy as cURL (bash)</b>，粘贴到「微信读书接口」输入框并保存</li>
    </ol>
    <a class="btn btn-primary btn-lg btn-block" :href="helperUrl" target="_blank">📋 打开获取工具（含书签/F12 图文） ↗</a>
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
