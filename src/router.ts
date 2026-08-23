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

// 纯前端无法安全完成 OAuth code → token 交换（需要 client_secret 服务端代理）。
// 若回调参数 code 看起来不是 access token，拒绝存储并引导使用 PAT。
function looksLikeToken(v: string): boolean {
  return /^(ghp_|github_pat_|gho_|ghu_|ghs_)/.test(v);
}

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();
  const code = to.query.code as string;
  if (code) {
    if (looksLikeToken(code)) {
      auth.setToken(code);
      next({ path: '/', query: {}, replace: true });
      return;
    }
    next({ path: '/login', query: { error: 'oauth_unsupported' }, replace: true });
    return;
  }
  if (to.meta.requiresAuth && !auth.isAuthenticated) { next('/login'); }
  else if (to.path === '/login' && auth.isAuthenticated) { next('/'); }
  else { next(); }
});

export default router;