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
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import Sidebar from '@/components/Sidebar.vue';
import LockScreen from '@/components/LockScreen.vue';
import { isLockEnabled, isUnlocked } from '@/utils/panelLock';

const authStore = useAuthStore();

const lockEnabled = isLockEnabled();
const unlocked = ref(!lockEnabled || isUnlocked());

function onUnlocked() {
  unlocked.value = true;
}
</script>

<style>
@import '@/assets/styles/main.css';
</style>
