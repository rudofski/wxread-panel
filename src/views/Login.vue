<template>
  <div class="login-page">
    <div class="login-card">
      <h1>wxread 控制面板</h1>
      <p class="login-desc">通过 GitHub 授权管理你的微信读书刷时长任务</p>
      <div class="login-methods">
        <button class="btn btn-primary login-btn" @click="oauthLogin">🔑 GitHub 授权登录</button>
        <div class="divider"><span>或手动输入 Token</span></div>
        <div class="form-group">
          <label class="form-label">GitHub Personal Access Token</label>
          <input v-model="inputToken" type="password" class="form-input" placeholder="ghp_xxxxxxxxxxxx" />
          <p class="form-hint">需包含 <code>repo</code> 和 <code>workflow</code> 权限。</p>
        </div>
        <button class="btn btn-default login-btn" @click="manualLogin" :disabled="!inputToken">使用 Token 登录</button>
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

function oauthLogin() { window.location.href = auth.getOAuthUrl(); }

async function manualLogin() {
  error.value = '';
  try {
    auth.setToken(inputToken.value);
    router.push('/');
  } catch (e: any) { error.value = e.message || '登录失败'; }
}
</script>

<style scoped>
.login-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
.login-card { background: #fff; border-radius: 12px; padding: 40px; width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.login-card h1 { font-size: 24px; text-align: center; margin-bottom: 8px; }
.login-desc { text-align: center; color: var(--color-text-light); margin-bottom: 32px; }
.login-btn { width: 100%; justify-content: center; padding: 12px; font-size: 15px; }
.divider { display: flex; align-items: center; margin: 20px 0; color: var(--color-text-light); font-size: 12px; }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }
.divider span { padding: 0 12px; }
.form-hint { margin-top: 4px; font-size: 12px; color: var(--color-text-light); }
.form-hint code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
.error-msg { margin-top: 16px; padding: 10px; background: #fff2f0; border: 1px solid #ffccc7; border-radius: 6px; color: var(--color-danger); font-size: 13px; }
</style>