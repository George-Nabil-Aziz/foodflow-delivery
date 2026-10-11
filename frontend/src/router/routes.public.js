const PublicLayout = () => import('../layouts/PublicLayout.vue');
const AuthLayout = () => import('../layouts/AuthLayout.vue');

export const publicRoutes = [
  {
    path: '/',
    component: PublicLayout,
    children: [
      { path: '', name: 'home', component: () => import('../views/public/HomeView.vue') },
      {
        path: 'restaurants',
        name: 'restaurants',
        component: () => import('../views/customer/RestaurantListView.vue'),
      },
      {
        path: 'restaurants/:id',
        name: 'restaurant-detail',
        component: () => import('../views/customer/RestaurantDetailView.vue'),
      },
    ],
  },
  {
    path: '/',
    component: AuthLayout,
    children: [
      {
        path: 'login',
        name: 'login',
        meta: { requiresGuest: true },
        component: () => import('../views/public/LoginView.vue'),
      },
      {
        path: 'register',
        name: 'register',
        meta: { requiresGuest: true },
        component: () => import('../views/public/RegisterView.vue'),
      },
    ],
  },
];
