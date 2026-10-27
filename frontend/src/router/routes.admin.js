const DashboardLayout = () => import('../layouts/DashboardLayout.vue');

const meta = { requiresAuth: true, roles: ['ADMIN'] };

export const adminRoutes = [
  {
    path: '/admin',
    component: DashboardLayout,
    children: [
      { path: '', name: 'admin-dashboard', meta, component: () => import('../views/admin/DashboardView.vue') },
      { path: 'attention', name: 'admin-attention', meta, component: () => import('../views/admin/AttentionView.vue') },
      // Users became one page per role; old links land on Customers.
      { path: 'users', name: 'admin-users', redirect: { name: 'admin-customers' } },
      { path: 'customers', name: 'admin-customers', meta, props: { role: 'CUSTOMER' }, component: () => import('../views/admin/UserListView.vue') },
      { path: 'customers/new', name: 'admin-customer-new', meta, props: { role: 'CUSTOMER' }, component: () => import('../views/admin/AccountCreateView.vue') },
      { path: 'admins/new', name: 'admin-admin-new', meta, props: { role: 'ADMIN' }, component: () => import('../views/admin/AccountCreateView.vue') },
      { path: 'admins', name: 'admin-admins', meta, props: { role: 'ADMIN' }, component: () => import('../views/admin/UserListView.vue') },
      { path: 'restaurants', name: 'admin-restaurants', meta, component: () => import('../views/admin/RestaurantsView.vue') },
      { path: 'restaurants/new', name: 'admin-restaurant-new', meta, props: { role: 'RESTAURANT' }, component: () => import('../views/admin/AccountCreateView.vue') },
      { path: 'drivers', name: 'admin-drivers', meta, component: () => import('../views/admin/DriversView.vue') },
      { path: 'drivers/new', name: 'admin-driver-new', meta, component: () => import('../views/admin/DriverCreateView.vue') },
      { path: 'orders', name: 'admin-orders', meta, component: () => import('../views/admin/OrdersView.vue') },
      { path: 'orders/new', name: 'admin-order-new', meta, component: () => import('../views/admin/OrderCreateView.vue') },
      { path: 'discount-codes', name: 'admin-discount-codes', meta, component: () => import('../views/admin/DiscountCodesView.vue') },
      { path: 'discount-codes/new', name: 'admin-discount-code-new', meta, component: () => import('../views/admin/DiscountCodeFormView.vue') },
      { path: 'discount-codes/:id/edit', name: 'admin-discount-code-edit', meta, props: true, component: () => import('../views/admin/DiscountCodeFormView.vue') },
      { path: 'reviews', name: 'admin-reviews', meta, component: () => import('../views/admin/ReviewsView.vue') },
    ],
  },
];
