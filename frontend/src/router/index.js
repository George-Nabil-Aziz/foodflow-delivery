import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.store.js';
import { publicRoutes } from './routes.public.js';
import { customerRoutes } from './routes.customer.js';
import { restaurantRoutes } from './routes.restaurant.js';
import { driverRoutes } from './routes.driver.js';
import { adminRoutes } from './routes.admin.js';

export const homeFor = (role) => {
  switch (role) {
    case 'RESTAURANT': return { name: 'restaurant-dashboard' };
    case 'DRIVER': return { name: 'driver-dashboard' };
    case 'ADMIN': return { name: 'admin-dashboard' };
    default: return { name: 'home' };
  }
};

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...publicRoutes,
    ...customerRoutes,
    ...restaurantRoutes,
    ...driverRoutes,
    ...adminRoutes,
    { path: '/403', name: 'forbidden', component: () => import('../views/public/ForbiddenView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/public/NotFoundView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (to.meta.requiresGuest && auth.isAuthenticated) return homeFor(auth.role);

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  // A wrong-role visit renders an explicit 403 rather than redirecting. A
  // silent redirect makes a dead link impossible to diagnose.
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) return { name: 'forbidden' };

  return true;
});
