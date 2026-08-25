import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/Login.vue') },
  { path: '/', name: 'Dashboard', component: () => import('@/views/Dashboard.vue'), meta: { requiresAuth: true } },
  { path: '/config', name: 'Config', component: () => import('@/views/Config.vue'), meta: { requiresAuth: true } },

];

const router = createRouter({ history: createWebHashHistory(), routes });

// 纯 PAT 登录：无 OAuth 回调处理，仅做登录态守卫
router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) { next('/login'); }
  else if (to.path === '/login' && auth.isAuthenticated) { next('/'); }
  else { next(); }
});

export default router;
