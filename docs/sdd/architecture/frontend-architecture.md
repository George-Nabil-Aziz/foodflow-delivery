# Frontend Architecture

> Parent: [master-sdd.md](../master-sdd.md) · Vue 3 · Vite · Vue Router 4 · Pinia · Axios · Tailwind CSS · VeeValidate

## 1. Directory structure

```text
frontend/
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   │   ├── index.js            # router instance + global guards
│   │   ├── routes.customer.js
│   │   ├── routes.restaurant.js
│   │   ├── routes.driver.js
│   │   ├── routes.admin.js
│   │   └── guards.js           # requiresAuth / requiresRole / requiresGuest
│   ├── layouts/
│   │   ├── PublicLayout.vue    # header + footer, no sidebar
│   │   ├── CustomerLayout.vue  # header with cart badge
│   │   ├── DashboardLayout.vue # sidebar shell reused by restaurant/driver/admin
│   │   └── AuthLayout.vue      # centered card
│   ├── views/
│   │   ├── public/   { HomeView, LoginView, RegisterView, NotFoundView, ForbiddenView }
│   │   ├── customer/ { RestaurantListView, RestaurantDetailView, CartView,
│   │   │               CheckoutView, MyOrdersView, OrderDetailView, OrderTrackingView,
│   │   │               ProfileView, AddressesView, MyReviewsView }
│   │   ├── restaurant/{ DashboardView, ProfileView, HoursView, CategoriesView,
│   │   │               MenuItemsView, IncomingOrdersView, OrderDetailView, OrderHistoryView }
│   │   ├── driver/   { DashboardView, OffersView, ActiveDeliveryView,
│   │   │               DeliveryHistoryView, ProfileView }
│   │   └── admin/    { DashboardView, UsersView, RestaurantsView, DriversView,
│   │                   OrdersView, ReviewsView, StatisticsView }
│   ├── components/
│   │   ├── shared/   { AppButton, AppInput, AppSelect, AppModal, AppCard, AppBadge,
│   │   │               AppPagination, AppSpinner, EmptyState, ErrorState, ConfirmDialog,
│   │   │               StarRating, MoneyAmount, StatusBadge, ToastHost }
│   │   ├── customer/ { RestaurantCard, RestaurantFilters, MenuCategorySection,
│   │   │               FoodItemCard, CartLineItem, CartSummary, AddressPicker,
│   │   │               OrderTimeline, OrderCard, ReviewForm }
│   │   ├── restaurant/{ IncomingOrderCard, OrderActionBar, CategoryForm, MenuItemForm,
│   │   │               MenuItemTable, HoursEditor, AcceptingOrdersToggle }
│   │   ├── driver/   { OfferCard, DeliveryStepper, DeliveryAddressPanel, AvailabilityToggle }
│   │   └── admin/    { StatTile, UserTable, RestaurantApprovalCard, OrderTable,
│   │                   ReviewModerationRow }
│   ├── composables/
│   │   ├── useApi.js           # request state: loading/error/data, cancellation
│   │   ├── usePagination.js
│   │   ├── useRestaurants.js
│   │   ├── useMenu.js
│   │   ├── useOrders.js
│   │   ├── useOrderPolling.js  # 10 s poll with visibility-aware pause
│   │   ├── useDriverOffers.js
│   │   ├── useAdminStats.js
│   │   ├── useConfirm.js
│   │   └── useFormErrors.js    # maps error.details[] onto form fields
│   ├── stores/
│   │   ├── auth.store.js
│   │   ├── cart.store.js
│   │   └── ui.store.js
│   ├── services/
│   │   ├── http.js             # axios instance, interceptors, refresh queue
│   │   ├── auth.service.js
│   │   ├── restaurants.service.js
│   │   ├── menu.service.js
│   │   ├── cart.service.js
│   │   ├── orders.service.js
│   │   ├── driver.service.js
│   │   ├── reviews.service.js
│   │   └── admin.service.js
│   ├── utils/  { money.js, datetime.js, orderStatus.js, validationRules.js, mask.js }
│   └── i18n/en.js              # all user-facing copy, incl. error-code messages
└── tests/ { unit/, component/ }
```

## 2. State management policy

Global state is a liability: it outlives the screen that needed it, it goes
stale invisibly, and it turns a list refresh into a cache-invalidation problem.
So FoodFlow keeps **three** Pinia stores and nothing more.

| Store | Holds | Why it must be global |
|-------|-------|-----------------------|
| `auth` | `user`, `accessToken`, `refreshToken`, `isAuthenticated`, `role`, `restaurant`/`driverProfile` | Read by the router guards, the HTTP layer and every layout |
| `cart` | `itemCount`, `restaurantId`, `restaurantName`, full `cart` object, `issues` | The header badge and the cart page must agree; add-to-cart happens from a dozen components |
| `ui` | `toasts[]`, `globalLoading`, `confirmDialog` | Cross-cutting by definition |

Everything else — restaurant lists, menus, order lists, admin tables, driver
offers — is **local state owned by the view**, loaded through a composable:

```js
// views/customer/RestaurantListView.vue
const { items, pagination, loading, error, load } = useRestaurants();
watch(filters, () => load(filters.value), { immediate: true });
```

`useRestaurants` returns fresh refs per caller, cancels the in-flight request
when filters change, and dies with the component. Two screens showing
restaurants do not fight over one array.

**`cart` store rules.** The store never computes totals or decides
orderability — it mirrors what `GET /api/cart` returned, including
`canCheckout`, `issues` and `totals`. The server is the only authority
(BR-C8, BR-C9); duplicating the arithmetic client-side would guarantee the two
disagree eventually, and the disagreement would be about money.

**`auth` store rules.** Tokens persist in `localStorage` under one key, restored
on boot, cleared on logout or on a failed refresh. The store exposes `role` but
**never** a `can()` helper that mirrors backend rules — the UI hides buttons the
user cannot use as a courtesy, and the server rejects them as the actual
control.

## 3. HTTP layer

```js
// services/http.js
const http = axios.create({ baseURL: import.meta.env.VITE_API_URL, timeout: 15000 });

http.interceptors.request.use((cfg) => {
  const auth = useAuthStore();
  if (auth.accessToken) cfg.headers.Authorization = `Bearer ${auth.accessToken}`;
  return cfg;
});

http.interceptors.response.use(
  (res) => res.data.data,                       // unwrap the envelope
  async (error) => {
    const { response, config } = error;
    if (!response) throw new NetworkError();

    if (response.status === 401 && !config._retried
        && response.data?.error?.code === 'TOKEN_EXPIRED') {
      config._retried = true;
      await refreshOnce();                      // single-flight; queues concurrent 401s
      return http(config);
    }
    if (response.status === 401) { useAuthStore().logout(); router.push('/login'); }

    throw new ApiError(response.data?.error ?? { code: 'INTERNAL_ERROR' }, response.status);
  },
);
```

`refreshOnce()` is single-flight: if five requests 401 at once, one refresh runs
and the other four wait on the same promise. Without that, a dashboard that
fires six parallel requests would burn six refresh tokens and — because refresh
tokens are single-use with reuse detection — trip `REFRESH_TOKEN_REUSED` and log
the user out. This is the one piece of client plumbing that must be right.

`ApiError` carries `code`, `message` and `details`, so views branch on stable
codes rather than on message text:

```js
catch (e) {
  if (e.code === 'CART_RESTAURANT_MISMATCH') showSwitchRestaurantDialog(e.details[0]);
  else ui.toastError(messageFor(e.code, e.message));
}
```

`messageFor` looks the code up in `i18n/en.js` and falls back to the server's
message — so copy is ours where we have an opinion, and the server's where it
knows more.

## 4. Routing and guards

```js
// router/guards.js
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresGuest && auth.isAuthenticated) return homeFor(auth.role);
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) return { name: 'forbidden' };
  return true;
});
```

Each role owns a route subtree with its own layout and a `meta.roles` gate:

| Prefix | Layout | Roles |
|--------|--------|-------|
| `/` , `/restaurants/*`, `/login`, `/register` | Public / Auth | — |
| `/account/*`, `/cart`, `/checkout`, `/orders/*` | CustomerLayout | CUSTOMER |
| `/restaurant/*` | DashboardLayout | RESTAURANT |
| `/driver/*` | DashboardLayout | DRIVER |
| `/admin/*` | DashboardLayout | ADMIN |

A wrong-role visit renders an explicit **403 view** rather than redirecting.
Silent redirects make "why did that link do nothing?" unanswerable; a 403 page
that names the required role is debuggable by the person hitting it.

A restaurant owner whose restaurant is `PENDING_APPROVAL` reaches
`/restaurant/*` but every operational screen renders a "pending approval" state
instead of its content, while profile and hours stay editable — matching the
server-side guard in [api-design §5](api-design.md#5-restaurant-self-service--apirestaurant).

## 5. Polling

`useOrderPolling(orderId)` hits `GET /api/orders/:id/status` every
`VITE_POLL_INTERVAL_MS` (default 10 000), and:

- pauses when `document.visibilityState === 'hidden'` and resumes with an immediate fetch;
- stops permanently once the status is terminal (`DELIVERED` / `CANCELLED`);
- backs off to 30 s after three consecutive failures, so a backend blip does not turn into a request storm;
- clears its interval in `onUnmounted` — always, including on the error path.

The same shape backs `useDriverOffers` (offers are time-critical, so 5 s while
`AVAILABLE`) and the restaurant's incoming-orders screen (10 s). These
composables are the seam where WebSockets replace polling later (Future
Enhancement 2) — only the composable changes.

## 6. Forms and validation

VeeValidate with rules from `utils/validationRules.js`, whose constraints are
transcribed from [master-sdd §15](../master-sdd.md#15-validation). Client rules
exist for latency, not for safety: they show an error on blur instead of after a
round trip. Every rule is enforced again server-side, and a test in the backend
suite covers each one independently.

On a `422 VALIDATION_ERROR`, `useFormErrors` maps `error.details[]` onto fields
by `field` name and focuses the first invalid control — so a rule the client
does not know about still lands on the right input.

## 7. Responsiveness and accessibility

- Tailwind, mobile-first. Breakpoints `sm 640 / md 768 / lg 1024 / xl 1280`. Verified at 360, 768 and 1440 px (NFR-13).
- Layout patterns: the dashboard sidebar collapses to a bottom nav under `md`; data tables become stacked cards under `md`; the cart is a page on mobile and a sticky side panel from `lg`.
- Accessibility (NFR-14): semantic landmarks, every input has a `<label>`, visible focus rings retained, modals trap focus and restore it on close, icon-only buttons carry `aria-label`, order status changes announce through an `aria-live="polite"` region, star ratings are a radio group operable by keyboard, and status is never communicated by color alone — `StatusBadge` always pairs a color with text.

## 8. Testing

| Kind | Tool | Targets |
|------|------|---------|
| Unit | Vitest | stores (auth token lifecycle, cart mirroring), `utils/money`, `orderStatus` label mapping, validation rules |
| Unit | Vitest + mocked axios | composables: loading/error transitions, polling start/stop/pause, refresh single-flight |
| Component | Vue Test Utils | `FoodItemCard` disabled when unavailable, `CartLineItem` quantity bounds, `ReviewForm` validation, `OrderActionBar` showing only the actions legal for the current status, `StatusBadge` text+color pairing |
| Integration-ish | Vue Test Utils + mocked services | `CheckoutView` error handling for `BELOW_MINIMUM_ORDER` and `CART_HAS_ISSUES`, the cross-restaurant switch dialog flow |

Component tests assert behaviour, not markup: "the add button is disabled and
announces why when the item is unavailable", not "the div has class `opacity-50`".
