const CustomerLayout = () => import('../layouts/CustomerLayout.vue');

const meta = { requiresAuth: true, roles: ['CUSTOMER'] };

export const customerRoutes = [
  {
    path: '/',
    component: CustomerLayout,
    children: [
      { path: 'cart', name: 'cart', meta, component: () => import('../views/customer/CartView.vue') },
      { path: 'checkout', name: 'checkout', meta, component: () => import('../views/customer/CheckoutView.vue') },
      { path: 'orders', name: 'orders', meta, component: () => import('../views/customer/MyOrdersView.vue') },
      { path: 'orders/:id', name: 'order-detail', meta, component: () => import('../views/customer/OrderDetailView.vue') },
      { path: 'account/profile', name: 'profile', meta, component: () => import('../views/customer/ProfileView.vue') },
      { path: 'account/addresses', name: 'addresses', meta, component: () => import('../views/customer/AddressesView.vue') },
      { path: 'account/addresses/new', name: 'address-new', meta, component: () => import('../views/customer/AddressCreateView.vue') },
      { path: 'account/favourites', name: 'favourites', meta, component: () => import('../views/customer/FavouritesView.vue') },
      { path: 'account/reviews', name: 'my-reviews', meta, component: () => import('../views/customer/MyReviewsView.vue') },
    ],
  },
];
