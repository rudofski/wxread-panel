import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { resetOctokit } from '@/api/github';

const TOKEN_KEY = 'github_token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const isAuthenticated = computed(() => !!token.value);

  function getOAuthUrl(): string {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || '';
    const redirectUri = window.location.origin + '/wxread-panel/';
    const scope = 'repo workflow';
    return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  }

  function setToken(t: string): void {
    token.value = t;
    localStorage.setItem(TOKEN_KEY, t);
  }

  function logout(): void {
    token.value = null;
    localStorage.removeItem(TOKEN_KEY);
    resetOctokit();
  }

  return { token, isAuthenticated, getOAuthUrl, setToken, logout };
});