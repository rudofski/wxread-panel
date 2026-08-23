<template>
  <div class="login-page">
    <div class="login-card">
      <h1>wxread 控制面板</h1>
      <p class="login-desc">管理你的微信读书刷时长任务</p>

      <div class="login-methods">
        <div class="form-group">
          <label class="form-label">GitHub Personal Access Token</label>
          <input
            v-model="inputToken"
            type="password"
            class="form-input"
            placeholder="ghp_xxxxxxxxxxxx"
            @keyup.enter="manualLogin"
          />
          <p class="form-hint">
            需包含 <code>repo</code> 和 <code>workflow</code> 权限。
            <a href="https://github.com/settings/tokens/new" target="_blank">创建 Token ↗</a>
          </p>

          <ol class="login-steps">
            <li>打开 <a href="https://github.com/settings/tokens" target="_blank">GitHub Token 设置 ↗</a></li>
            <li>Generate new token，勾选 <code>repo</code> 与 <code>workflow</code> 权限</li>
            <li>复制 <code>ghp_...</code> 粘贴到上方输入框并登录</li>
          </ol>
        </div>

        <button class="btn btn-primary login-btn" @click="manualLogin" :disabled="!inputToken.trim()">
          使用 Token 登录
        </button>
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const inputToken = ref('');
const error = ref('');

function manualLogin() {
  error.value = '';
  const t = inputToken.value.trim();
  if (!t) { error.value = '请输入 Token'; return; }
  auth.setToken(t);
  router.push('/');
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.login-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  width: 440px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.login-card h1 {
  font-size: 24px;
  text-align: center;
  margin-bottom: 8px;
}

.login-desc {
  text-align: center;
  color: var(--color-text-light);
  margin-bottom: 32px;
}

.login-btn {
  width: 100%;
  justify-content: center;
  padding: 12px;
  font-size: 15px;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-light);
}

.form-hint code {
  background: #f0f0f0;
  padding: 1px 4px;
  border-radius: 3px;
}

.login-steps {
  margin-top: 12px;
  padding-left: 20px;
  font-size: 12px;
  color: var(--color-text-light);
  line-height: 1.8;
}

.login-steps code {
  background: #f0f0f0;
  padding: 1px 4px;
  border-radius: 3px;
}

.error-msg {
  margin-top: 16px;
  padding: 10px;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 6px;
  color: var(--color-danger);
  font-size: 13px;
}
</style>
