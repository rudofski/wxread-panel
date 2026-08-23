<template>
  <LockScreen v-if="lockEnabled && !unlocked" @unlocked="onUnlocked" />
  <template v-else>
    <div v-if="authStore.isAuthenticated" class="app-layout">
      <Sidebar />
      <main class="app-main">
        <router-view />
      </main>
    </div>
    <div v-else class="app-layout">
      <router-view />
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import Sidebar from '@/components/Sidebar.vue';
import LockScreen from '@/components/LockScreen.vue';
import { isLockEnabled, isUnlocked } from '@/utils/panelLock';

const authStore = useAuthStore();
const settingsStore = useSettingsStore();

const lockEnabled = isLockEnabled();
const unlocked = ref(!lockEnabled || isUnlocked());

function onUnlocked() {
  unlocked.value = true;
}

// wxread 回读：打开面板时若已登录且记忆了仓库地址，自动连接并刷新远程状态
// （回读 README 变量 + Secrets 存在性，仪表盘显示真实远程状态而非“未配置”)
onMounted(() => {
  if (!authStore.isAuthenticated) return;
  if (!settingsStore.repoUrl) return;
  if (settingsStore.repoStatus === 'connected' || settingsStore.repoStatus === 'connecting') return;
  settingsStore.connectRepo(settingsStore.repoUrl);
});
</script>

<style>
@import '@/assets/styles/main.css';
</style>
