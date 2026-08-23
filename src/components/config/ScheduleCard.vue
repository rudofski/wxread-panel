<template>
  <div class="card schedule-card">
    <div class="card-title">⏰ 定时任务</div>
    <div class="form-group">
      <label class="form-label schedule-toggle">
        <input type="checkbox" v-model="schedule.enabled" /> 启用每日定时运行
      </label>
    </div>
    <div v-if="schedule.enabled" class="schedule-settings">
      <label class="form-label">运行时间</label>
      <input type="time" v-model="schedule.time" class="form-input" style="width: 160px;" />
      <span class="timezone">时区：Asia/Shanghai (UTC+8)</span>
    </div>
    <div class="schedule-actions">
      <button class="btn btn-default" @click="save">💾 保存定时设置</button>
      <span v-if="msg" class="save-msg" :class="ok ? 'ok' : 'error'">{{ msg }}</span>
    </div>
    <p class="form-hint">定时执行由 wxread 仓库的 GitHub Actions schedule(cron) 控制，此设置仅作面板记录与提醒。</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { loadSchedule, saveSchedule, type Schedule } from '@/utils/schedule';

const schedule = ref<Schedule>({ enabled: false, time: '08:00' });
const msg = ref('');
const ok = ref(true);

onMounted(() => {
  schedule.value = loadSchedule();
});

function save() {
  try {
    saveSchedule(schedule.value);
    msg.value = '✅ 定时设置已保存';
    ok.value = true;
  } catch (e: any) {
    msg.value = `❌ ${e.message}`;
    ok.value = false;
  }
}
</script>

<style scoped>
.schedule-toggle { font-weight: 500; }
.schedule-settings { margin-top: 12px; padding: 12px; background: #f9f9f9; border-radius: 6px; }
.timezone { display: block; margin-top: 4px; font-size: 12px; color: var(--color-text-light); }
.schedule-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.save-msg { font-size: 13px; }
.save-msg.ok { color: var(--color-success); }
.save-msg.error { color: var(--color-danger); }
.form-hint { font-size: 12px; color: var(--color-text-light); margin-top: 10px; }
</style>
