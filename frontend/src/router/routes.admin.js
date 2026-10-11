const DashboardLayout = () => import('../layouts/DashboardLayout.vue');

const meta = { requiresAuth: true, roles: ['ADMIN'] };

export const adminRoutes = [
  {
    path: '/admin',
    component: DashboardLayout,
    children: [
      { path: '', name: 'admin-dashboard', meta, component: () => import('../views/admin/DashboardView.vue') },
      { path: 'users', name: 'admin-users', meta, component: () => import('../views/admin/UsersView.vue') },
      { path: 'restaurants', name: 'admin-restaurants', meta, component: () => import('../views/admin/RestaurantsView.vue') },
      { path: 'drivers', name: 'admin-drivers', meta, component: () => import('../views/admin/DriversView.vue') },
      { path: 'orders', name: 'admin-orders', meta, component: () => import('../views/admin/OrdersView.vue') },
      { path: 'reviews', name: 'admin-reviews', meta, component: () => import('../views/admin/ReviewsView.vue') },
    ],
  },
];
