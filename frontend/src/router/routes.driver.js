const DashboardLayout = () => import('../layouts/DashboardLayout.vue');

const meta = { requiresAuth: true, roles: ['DRIVER'] };

export const driverRoutes = [
  {
    path: '/driver',
    component: DashboardLayout,
    children: [
      { path: '', name: 'driver-dashboard', meta, component: () => import('../views/driver/DashboardView.vue') },
      { path: 'offers', name: 'driver-offers', meta, component: () => import('../views/driver/OffersView.vue') },
      { path: 'deliveries/:orderId', name: 'driver-delivery', meta, component: () => import('../views/driver/ActiveDeliveryView.vue') },
      { path: 'history', name: 'driver-history', meta, component: () => import('../views/driver/DeliveryHistoryView.vue') },
      { path: 'profile', name: 'driver-profile', meta, component: () => import('../views/driver/ProfileView.vue') },
    ],
  },
];
