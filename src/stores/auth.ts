import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { resetOctokit } from '@/api/github';

const TOKEN_KEY = 'github_token';

// 纯 PAT 登录：GitHub Pages 纯前端无法安全完成 OAuth code → token 交换
// （需要 client_secret 服务端代理），因此仅支持 Personal Access Token。
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const isAuthenticated = computed(() => !!token.value);

  function setToken(t: string): void {
    token.value = t;
    localStorage.setItem(TOKEN_KEY, t);
  }

  function logout(): void {
    token.value = null;
    localStorage.removeItem(TOKEN_KEY);
    resetOctokit();
  }

  return { token, isAuthenticated, setToken, logout };
});
