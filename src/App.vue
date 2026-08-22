<template>
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

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
import Sidebar from '@/components/Sidebar.vue';

const authStore = useAuthStore();
</script>

<style>
@import '@/assets/styles/main.css';
</style>