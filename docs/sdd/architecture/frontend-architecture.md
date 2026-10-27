# Frontend Architecture

> Parent: [master-sdd.md](../master-sdd.md) · Vue 3 · Vite · Vue Router 4 · Pinia · Axios · Tailwind CSS · VeeValidate

## 1. Directory structure

```text
frontend/
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   │   ├── index.js            # router instance, homeFor(role) and the global guard
│   │   ├── routes.public.js
│   │   ├── routes.customer.js
│   │   ├── routes.restaurant.js
│   │   ├── routes.driver.js
│   │   └── routes.admin.js
│   ├── layouts/
│   │   ├── SiteLayout.vue      # public pages: DashboardLayout for a signed-in customer, else PublicLayout
│   │   ├── PublicLayout.vue    # header + footer, no sidebar (guests and other roles)
│   │   ├── CustomerLayout.vue  # wraps DashboardLayout for the customer's own pages
│   │   ├── DashboardLayout.vue # sidebar shell for every signed-in role
│   │   └── AuthLayout.vue      # centered card
│   ├── views/
│   │   ├── public/   { HomeView, LandingView, LoginView, RegisterView, NotFoundView, ForbiddenView }
│   │   ├── customer/ { DiscoverView, RestaurantListView, RestaurantDetailView, CartView,
│   │   │               CheckoutView, MyOrdersView, OrderDetailView, ProfileView,
│   │   │               AddressesView, AddressCreateView, MyReviewsView }
│   │   ├── restaurant/{ DashboardView, ProfileView, HoursView, CategoriesView, CategoryFormView,
│   │   │               MenuItemsView, IncomingOrdersView, OrderDetailView }
│   │   ├── driver/   { DashboardView, OffersView, ActiveDeliveryView,
│   │   │               DeliveryHistoryView, ProfileView }
│   │   └── admin/    { DashboardView, AttentionView, UserListView, AccountCreateView,
│   │                   RestaurantsView, DriversView, DriverCreateView, OrdersView,
│   │                   OrderCreateView, ReviewsView }
│   ├── components/
│   │   ├── shared/   { AppButton, AppInput, AppPagination, AppSpinner, EmptyState, ErrorState,
│   │   │               ConfirmDialog, DetailsDialog, StarRating, RatingStars, MoneyAmount,
│   │   │               StatusBadge, AccountStatusBadge, DeletedBadge, PageTitle, FilterBar,
│   │   │               FilterSearch, FilterSelect, BrandLogo, MenuButton, MobileDrawer,
│   │   │               SignOutButton, LanguageToggle, ThemeToggle, BackToTop, DevAccounts,
│   │   │               ToastHost }
│   │   ├── customer/ { RestaurantCard, FoodItemCard, OrderTimeline, SearchAutocomplete,
│   │   │               SwitchRestaurantDialog }
│   │   └── admin/    { OrderDetailsDialog }
│   ├── composables/
│   │   ├── useApi.js           # request state: loading/error/data, cancellation
│   │   ├── usePagination.js
│   │   ├── useRestaurants.js
│   │   ├── useMenu.js
│   │   ├── useOrders.js
│   │   ├── useOrderPolling.js  # 10 s poll with visibility-aware pause
│   │   ├── useLiveUpdates.js   # SSE-driven refetch with polling fallback (spec-14)
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
// router/index.js
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresGuest && auth.isAuthenticated) return homeFor(auth.role);
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) return { name: 'forbidden' };
  return true;
});
```

Each role owns a route subtree with a `meta.roles` gate:

| Prefix | Layout | Roles |
|--------|--------|-------|
| `/`, `/restaurants`, `/restaurants/:id` | SiteLayout | — |
| `/login`, `/register` | AuthLayout | — (guests only) |
| `/account/*`, `/cart`, `/checkout`, `/orders/*` | CustomerLayout (→ DashboardLayout) | CUSTOMER |
| `/restaurant/*` | DashboardLayout | RESTAURANT |
| `/driver/*` | DashboardLayout | DRIVER |
| `/admin/*` | DashboardLayout | ADMIN |

**One shell for every signed-in role.** `DashboardLayout` is the sidebar shell
of all four roles, the customer included. Its header holds only the user's name
and role, the language and theme toggles and sign-out; all navigation is in the
sidebar (a `MobileDrawer` opened by `MenuButton` below `md`). The customer's
sidebar is Home, Restaurants, My orders, Cart (with the item count), Profile,
Addresses and My reviews; `CustomerLayout` now only wraps `DashboardLayout`.

**`SiteLayout`** serves the public routes. It renders `DashboardLayout` for a
signed-in customer, so browsing restaurants keeps their sidebar, and
`PublicLayout` for a guest or any other role.

**Active sidebar item.** An item stays highlighted on every page under it: the
current path is compared by prefix with the item's path, because routes such as
`/admin/orders/new` are siblings of `/admin/orders`, not children, and
RouterLink's own active class would miss them. A section root (Dashboard, Home)
matches only exactly, plus the route names in its `also` list: "Needs
attention" (`admin-attention`) under the admin Dashboard, `checkout` under Cart.

**Forms on their own page.** Creating or editing a record opens a page rather
than an inline form or modal: `/restaurant/categories/new` and
`/restaurant/categories/:id/edit` (`CategoryFormView`),
`/account/addresses/new` (`AddressCreateView`; opened as
`?from=checkout` it returns to checkout after saving),
`/admin/customers/new`, `/admin/admins/new`, `/admin/restaurants/new`
(`AccountCreateView`), `/admin/drivers/new` (`DriverCreateView`) and
`/admin/orders/new` (`OrderCreateView`). Each list reaches its form through the
"Add …" action in its `FilterBar`.

**Admin lists.** `PageTitle` shows the list's total beside its title.
`FilterSelect` is a styled listbox built to the ARIA pattern, not a native
`<select>`, because it shows each choice's count in brackets. A row's name or
order number opens `DetailsDialog` or `OrderDetailsDialog`, a popup with
everything about the record. `AccountStatusBadge` colours a restaurant's or
driver's status the same on both lists: active green, pending amber, suspended
red, rejected grey.
`RatingStars` shows a rating as lit stars, not "n/5".

A wrong-role visit renders an explicit **403 view** rather than redirecting.
Silent redirects make "why did that link do nothing?" unanswerable; a 403 page
that names the required role is debuggable by the person hitting it.

A restaurant owner whose restaurant is `PENDING_APPROVAL` reaches
`/restaurant/*` but every operational screen renders a "pending approval" state
instead of its content, while profile and hours stay editable — matching the
server-side guard in [api-design §5](api-design.md#5-restaurant-self-service--apirestaurant).

## 5. Live updates and polling

Order status, the restaurant's incoming orders and the driver's offers are
**pushed** over one server-sent-events stream per tab
([spec-14](../specs/spec-14-live-updates.md)), with polling as the automatic
fallback.

- `services/liveStream.js` owns the single `EventSource`. It authenticates with a
  single-use 30 s ticket from `POST /api/events/ticket` (the access token never
  enters a URL), reconnects with capped exponential backoff and a fresh ticket,
  closes while the tab is hidden, and emits a `resync` on every (re)connect
  because missed events are not replayed.
- `useLiveUpdates(fetcher, { events, filter, ...pollingOptions })` wraps
  `usePolling`. While the stream is open the poll timer is suspended and a
  matching event triggers a debounced refetch through the same `fetcher`. Events
  carry ids and a status only, so authorization and response shape stay in the
  REST endpoints. When the stream is connecting, paused or failed it polls.
- `usePolling` keeps its behaviour: it fetches every `VITE_POLL_INTERVAL_MS`
  (default 10 000; offers use `VITE_OFFER_POLL_INTERVAL_MS`, default 5 000),
  pauses when `document.visibilityState === 'hidden'` and resumes with an
  immediate fetch, stops permanently once `shouldStop` says the data is final
  (a `DELIVERED` / `CANCELLED` order), backs off to 30 s after three consecutive
  failures so a backend blip does not become a request storm, and clears its
  timer in `onUnmounted` — always, including on the error path. It gains
  `suspend()` / `resume()`, which `useLiveUpdates` uses to hand over.

Consumers: `customer/OrderDetailView` (`order.status`, `order.updated`, filtered
to its own order id), `restaurant/IncomingOrdersView` (`order.*`) and
`driver/OffersView` (`offer.*`). A new live screen uses `useLiveUpdates` rather
than opening its own connection. Moving the server to several processes
(Postgres LISTEN/NOTIFY or Redis) is entirely server-side and does not touch the
client.

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
- Layout patterns: the dashboard sidebar becomes a drawer behind a menu button under `md`; data tables become stacked cards under `md`; the cart is a page on mobile and a sticky side panel from `lg`.
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
