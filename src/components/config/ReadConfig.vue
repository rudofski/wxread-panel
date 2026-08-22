<template>
  <div class="card"><div class="card-title">阅读设置</div>
    <div class="form-group"><label class="form-label">阅读时长</label>
      <div class="read-input-group"><input v-model.number="minutes" type="number" class="form-input" min="1" max="500" style="width:100px" /><span class="unit">分钟</span></div>
      <p class="form-hint">换算：<strong>{{ settings.readCount }}</strong> 次 x 30秒 = <strong>{{ settings.readMinutes }}</strong> 分钟</p>
    </div>
    <div class="form-group"><label class="form-label">快捷选择</label>
      <div class="quick-btns"><button v-for="opt in settings.quickReadOptions" :key="opt.value" class="btn" :class="settings.readMinutes === opt.value ? 'btn-primary' : 'btn-default'" @click="setMinutes(opt.value)">{{ opt.label }}</button></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
const settings = useSettingsStore();
const minutes = ref(settings.readMinutes);
watch(minutes, v => { if (v && v >= 1 && v <= 500) settings.readMinutes = Math.round(v); });
function setMinutes(val: number) { minutes.value = val; }
</script>
<style scoped>
.read-input-group { display: flex; align-items: center; gap: 8px; }
.unit { font-size: 14px; color: var(--color-text-light); }
.quick-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.form-hint { margin-top: 4px; font-size: 12px; color: var(--color-text-light); }
</style>