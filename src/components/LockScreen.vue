<template>
  <div class="lock-page">
    <div class="lock-card">
      <div class="lock-icon">🔒</div>
      <h1>wxread 控制面板</h1>
      <p class="lock-desc">请输入访问密码以继续</p>
      <input
        v-model="password"
        type="password"
        class="form-input"
        placeholder="访问密码"
        autofocus
        @keyup.enter="submit"
      />
      <button class="btn btn-primary lock-btn" @click="submit" :disabled="checking">
        {{ checking ? '验证中...' : '解锁' }}
      </button>
      <p v-if="error" class="error-msg">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { verifyPassword, setUnlocked } from '@/utils/panelLock';

const emit = defineEmits<{ unlocked: [] }>();

const password = ref('');
const checking = ref(false);
const error = ref('');

async function submit() {
  if (checking.value) return;
  error.value = '';
  checking.value = true;
  try {
    const ok = await verifyPassword(password.value);
    if (ok) {
      setUnlocked();
      emit('unlocked');
    } else {
      error.value = '密码错误，请重试';
    }
  } finally {
    checking.value = false;
  }
}
</script>

<style scoped>
.lock-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}
.lock-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  width: 360px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  text-align: center;
}
.lock-icon { font-size: 40px; margin-bottom: 12px; }
.lock-card h1 { font-size: 22px; margin-bottom: 8px; }
.lock-desc { color: var(--color-text-light); margin-bottom: 24px; font-size: 14px; }
.lock-btn { width: 100%; justify-content: center; padding: 12px; margin-top: 16px; font-size: 15px; }
.error-msg {
  margin-top: 16px; padding: 10px;
  background: #fff2f0; border: 1px solid #ffccc7; border-radius: 6px;
  color: var(--color-danger); font-size: 13px;
}
</style>
