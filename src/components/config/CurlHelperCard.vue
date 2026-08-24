<template>
  <div class="card"><div class="card-title">📋 一键获取 curl_bash</div>
    <p class="desc">获取微信读书登录凭证（curl_bash），<b>Chrome 扩展最省心</b>（可读取 HttpOnly 凭证，一键生成）：</p>
    <ol class="steps">
      <li>打开<a :href="helperUrl" target="_blank">获取工具页 ↗</a> 下载扩展 ZIP 并解压，在 <code>chrome://extensions</code> 开发者模式「加载已解压的扩展程序」</li>
      <li>打开微信读书阅读页并<b>翻一页</b>，点击工具栏 🎣 图标 → 自动生成完整 curl_bash → 复制</li>
      <li>粘贴到「微信读书接口」输入框并保存</li>
    </ol>
    <a class="btn btn-primary btn-lg btn-block" :href="helperUrl" target="_blank">📋 打开获取工具（扩展安装图文） ↗</a>
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
