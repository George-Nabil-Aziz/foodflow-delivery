const DashboardLayout = () => import('../layouts/DashboardLayout.vue');

const meta = { requiresAuth: true, roles: ['RESTAURANT'] };

export const restaurantRoutes = [
  {
    path: '/restaurant',
    component: DashboardLayout,
    children: [
      { path: '', name: 'restaurant-dashboard', meta, component: () => import('../views/restaurant/DashboardView.vue') },
      { path: 'orders', name: 'restaurant-orders', meta, component: () => import('../views/restaurant/IncomingOrdersView.vue') },
      { path: 'orders/:id', name: 'restaurant-order-detail', meta, component: () => import('../views/restaurant/OrderDetailView.vue') },
      { path: 'menu', name: 'restaurant-menu', meta, component: () => import('../views/restaurant/MenuItemsView.vue') },
      { path: 'categories', name: 'restaurant-categories', meta, component: () => import('../views/restaurant/CategoriesView.vue') },
      { path: 'profile', name: 'restaurant-profile', meta, component: () => import('../views/restaurant/ProfileView.vue') },
      { path: 'hours', name: 'restaurant-hours', meta, component: () => import('../views/restaurant/HoursView.vue') },
    ],
  },
];
