import { http } from './http.js';

/**
 * One module per API domain. Every call returns the envelope, so callers can
 * read both `data` and `meta.pagination`.
 */

export const authApi = {
  register: (body) => http.post('/auth/register', body),
  login: (body) => http.post('/auth/login', body),
  refresh: (refreshToken) => http.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken) => http.post('/auth/logout', { refreshToken }),
  changePassword: (body) => http.post('/auth/change-password', body),
  me: () => http.get('/me'),
  updateMe: (body) => http.patch('/me', body),
};

export const addressApi = {
  list: () => http.get('/addresses'),
  create: (body) => http.post('/addresses', body),
  update: (id, body) => http.patch(`/addresses/${id}`, body),
  remove: (id) => http.delete(`/addresses/${id}`),
  setDefault: (id) => http.post(`/addresses/${id}/default`),
};

export const discoveryApi = {
  listRestaurants: (params) => http.get('/restaurants', { params }),
  getRestaurant: (id) => http.get(`/restaurants/${id}`),
  getMenu: (id) => http.get(`/restaurants/${id}/menu`),
  getReviews: (id, params) => http.get(`/restaurants/${id}/reviews`, { params }),
  search: (params) => http.get('/search', { params }),
  cuisines: () => http.get('/cuisines'),
};

export const cartApi = {
  get: () => http.get('/cart'),
  addItem: (body, { replace = false } = {}) =>
    http.post(`/cart/items${replace ? '?replace=true' : ''}`, body),
  updateQuantity: (itemId, quantity) => http.patch(`/cart/items/${itemId}`, { quantity }),
  removeItem: (itemId) => http.delete(`/cart/items/${itemId}`),
  clear: () => http.delete('/cart'),
};

export const orderApi = {
  checkout: (body) => http.post('/orders', body),
  list: (params) => http.get('/orders', { params }),
  get: (id) => http.get(`/orders/${id}`),
  status: (id) => http.get(`/orders/${id}/status`),
  cancel: (id, body) => http.post(`/orders/${id}/cancel`, body ?? {}),
};

export const reviewApi = {
  create: (body) => http.post('/reviews', body),
  mine: (params) => http.get('/reviews/mine', { params }),
  update: (id, body) => http.patch(`/reviews/${id}`, body),
};

export const restaurantApi = {
  profile: () => http.get('/restaurant/profile'),
  updateProfile: (body) => http.patch('/restaurant/profile', body),
  hours: () => http.get('/restaurant/hours'),
  replaceHours: (hours) => http.put('/restaurant/hours', { hours }),
  setAcceptingOrders: (isAcceptingOrders) =>
    http.patch('/restaurant/accepting-orders', { isAcceptingOrders }),
  stats: () => http.get('/restaurant/stats'),
  categories: () => http.get('/restaurant/categories'),
  createCategory: (body) => http.post('/restaurant/categories', body),
  updateCategory: (id, body) => http.patch(`/restaurant/categories/${id}`, body),
  deleteCategory: (id) => http.delete(`/restaurant/categories/${id}`),
  reorderCategories: (categories) => http.put('/restaurant/categories/order', { categories }),
  items: (params) => http.get('/restaurant/items', { params }),
  createItem: (body) => http.post('/restaurant/items', body),
  updateItem: (id, body) => http.patch(`/restaurant/items/${id}`, body),
  setAvailability: (id, isAvailable) =>
    http.patch(`/restaurant/items/${id}/availability`, { isAvailable }),
  deleteItem: (id) => http.delete(`/restaurant/items/${id}`),
  orders: (params) => http.get('/restaurant/orders', { params }),
  order: (id) => http.get(`/restaurant/orders/${id}`),
  orderAction: (id, action, body) => http.post(`/restaurant/orders/${id}/${action}`, body ?? {}),
  reviews: (params) => http.get('/restaurant/reviews', { params }),
};

export const driverApi = {
  profile: () => http.get('/driver/profile'),
  updateProfile: (body) => http.patch('/driver/profile', body),
  setAvailability: (availability) => http.patch('/driver/availability', { availability }),
  updateLocation: (body) => http.patch('/driver/location', body),
  offers: () => http.get('/driver/offers'),
  acceptOffer: (id) => http.post(`/driver/offers/${id}/accept`),
  declineOffer: (id, reason) => http.post(`/driver/offers/${id}/decline`, { reason }),
  deliveries: (params) => http.get('/driver/deliveries', { params }),
  delivery: (orderId) => http.get(`/driver/deliveries/${orderId}`),
  pickUp: (orderId) => http.post(`/driver/deliveries/${orderId}/pick-up`),
  deliver: (orderId) => http.post(`/driver/deliveries/${orderId}/deliver`),
  reviews: () => http.get('/driver/reviews'),
};

export const adminApi = {
  stats: () => http.get('/admin/stats'),
  users: (params) => http.get('/admin/users', { params }),
  user: (id) => http.get(`/admin/users/${id}`),
  suspendUser: (id, reason) => http.post(`/admin/users/${id}/suspend`, { reason }),
  reactivateUser: (id, reason) => http.post(`/admin/users/${id}/reactivate`, { reason }),
  // DELETE carries its reason in the body, which axios takes as `data`.
  deleteUser: (id, reason) => http.delete(`/admin/users/${id}`, { data: { reason } }),
  restoreUser: (id) => http.post(`/admin/users/${id}/restore`, {}),
  drivers: (params) => http.get('/admin/drivers', { params }),
  createUser: (body) => http.post('/admin/users', body),
  createDriver: (body) => http.post('/admin/drivers', body),
  approveDriver: (id) => http.post(`/admin/drivers/${id}/approve`, {}),
  suspendDriver: (id, reason) => http.post(`/admin/drivers/${id}/suspend`, { reason }),
  deleteDriver: (id, reason) => http.delete(`/admin/drivers/${id}`, { data: { reason } }),
  restoreDriver: (id) => http.post(`/admin/drivers/${id}/restore`, {}),
  restaurants: (params) => http.get('/admin/restaurants', { params }),
  approveRestaurant: (id) => http.post(`/admin/restaurants/${id}/approve`, {}),
  rejectRestaurant: (id, reason) => http.post(`/admin/restaurants/${id}/reject`, { reason }),
  suspendRestaurant: (id, reason) => http.post(`/admin/restaurants/${id}/suspend`, { reason }),
  reactivateRestaurant: (id) => http.post(`/admin/restaurants/${id}/reactivate`, {}),
  deleteRestaurant: (id, reason) => http.delete(`/admin/restaurants/${id}`, { data: { reason } }),
  restoreRestaurant: (id) => http.post(`/admin/restaurants/${id}/restore`, {}),
  orders: (params) => http.get('/admin/orders', { params }),
  order: (id) => http.get(`/admin/orders/${id}`),
  unassigned: () => http.get('/admin/orders/unassigned'),
  stuck: () => http.get('/admin/orders/stuck'),
  placeOrder: (body) => http.post('/admin/orders', body),
  customerAddresses: (id) => http.get(`/admin/users/${id}/addresses`),
  forceCancel: (id, body) => http.post(`/admin/orders/${id}/force-cancel`, body),
  reviews: (params) => http.get('/admin/reviews', { params }),
  hideReview: (id, reason) => http.post(`/admin/reviews/${id}/hide`, { reason }),
  restoreReview: (id) => http.post(`/admin/reviews/${id}/restore`, {}),
  auditLogs: (params) => http.get('/admin/audit-logs', { params }),
};
