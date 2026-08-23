<template>
  <nav class="sidebar">
    <div class="sidebar-logo">wxread</div>
    <div class="sidebar-nav">
      <router-link v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item" active-class="active">
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>
    <div class="sidebar-footer">
      <div class="version">v{{ version }}</div>
      <button class="logout-btn" @click="logout">退出</button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
// 版本号单一事实来源：package.json（避免界面版本与项目版本再次漂移）
import pkg from '../../package.json';

const version = pkg.version;
const router = useRouter();
const auth = useAuthStore();

const navItems = [
  { path: '/', icon: '📊', label: '仪表盘' },
  { path: '/config', icon: '⚙️', label: '配置' },
  { path: '/calendar', icon: '📅', label: '运行日历' },
];

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.sidebar {
  position: fixed; left: 0; top: 0; bottom: 0; width: var(--sidebar-width);
  background: var(--color-sidebar); color: #fff; display: flex;
  flex-direction: column; z-index: 100;
}
.sidebar-logo { padding: 20px; font-size: 18px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.1); }
.sidebar-nav { flex: 1; padding: 12px 0; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 12px 20px; color: rgba(255,255,255,0.65); text-decoration: none; transition: all 0.2s; }
.nav-item:hover, .nav-item.active { color: #fff; background: rgba(255,255,255,0.08); }
.nav-icon { font-size: 18px; }
.nav-label { font-size: 14px; }
.sidebar-footer { padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: rgba(255,255,255,0.4); }
.logout-btn { margin-top: 8px; background: none; border: 1px solid rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.logout-btn:hover { background: rgba(255,255,255,0.1); }
</style>