import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/Login.vue') },
  { path: '/', name: 'Dashboard', component: () => import('@/views/Dashboard.vue'), meta: { requiresAuth: true } },
  { path: '/config', name: 'Config', component: () => import('@/views/Config.vue'), meta: { requiresAuth: true } },
  { path: '/books', name: 'Books', component: () => import('@/views/Books.vue'), meta: { requiresAuth: true } },
  { path: '/tasks', name: 'Tasks', component: () => import('@/views/Tasks.vue'), meta: { requiresAuth: true } },
  { path: '/calendar', name: 'Calendar', component: () => import('@/views/Calendar.vue'), meta: { requiresAuth: true } },
];

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();
  const code = to.query.code as string;
  if (code) {
    auth.setToken(code);
    next({ path: '/', query: {}, replace: true });
    return;
  }
  if (to.meta.requiresAuth && !auth.isAuthenticated) { next('/login'); }
  else if (to.path === '/login' && auth.isAuthenticated) { next('/'); }
  else { next(); }
});

export default router;