<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.store.js';
import { useCartStore } from '../stores/cart.store.js';
import BrandLogo from '../components/shared/BrandLogo.vue';
import ThemeToggle from '../components/shared/ThemeToggle.vue';
import LanguageToggle from '../components/shared/LanguageToggle.vue';
import MobileDrawer from '../components/shared/MobileDrawer.vue';
import MenuButton from '../components/shared/MenuButton.vue';
import SignOutButton from '../components/shared/SignOutButton.vue';
import { useIsDesktop } from '../composables/useMediaQuery.js';
import { t } from '../i18n/index.js';

const auth = useAuthStore();
const cart = useCartStore();
const router = useRouter();
const route = useRoute();
const isDesktop = useIsDesktop();
const menuOpen = ref(false);
// Growing past the breakpoint with the drawer open would strand it open.
watch(isDesktop, (desktop) => { if (desktop) menuOpen.value = false; });

/**
 * Each role sees only its own navigation. This is a courtesy: the server
 * rejects the calls regardless of what the menu shows.
 */
const NAV = {
  // A customer's restaurant pages are public routes; signed in, they render here too.
  CUSTOMER: [
    { to: { name: 'home' }, label: 'Home', always: true, exact: true },
    { to: { name: 'restaurants' }, label: 'Restaurants', always: true },
    { to: { name: 'orders' }, label: 'My orders', always: true },
    { to: { name: 'favourites' }, label: 'Favourites', always: true },
    { to: { name: 'cart' }, label: 'Cart', always: true, also: ['checkout'], showsCart: true },
    { to: { name: 'profile' }, label: 'Profile', always: true },
    { to: { name: 'addresses' }, label: 'Addresses', always: true },
    { to: { name: 'my-reviews' }, label: 'My reviews', always: true },
  ],
  RESTAURANT: [
    { to: { name: 'restaurant-dashboard' }, label: 'Dashboard', always: true, exact: true },
    { to: { name: 'restaurant-orders' }, label: 'Orders' },
    { to: { name: 'restaurant-menu' }, label: 'Menu items' },
    { to: { name: 'restaurant-categories' }, label: 'Categories' },
    { to: { name: 'restaurant-analytics' }, label: 'Analytics' },
    { to: { name: 'restaurant-profile' }, label: 'Profile', always: true },
    { to: { name: 'restaurant-hours' }, label: 'Opening hours', always: true },
  ],
  DRIVER: [
    { to: { name: 'driver-dashboard' }, label: 'Dashboard', always: true, exact: true },
    { to: { name: 'driver-offers' }, label: 'Offers' },
    { to: { name: 'driver-history' }, label: 'History' },
    { to: { name: 'driver-profile' }, label: 'Profile', always: true },
  ],
  ADMIN: [
    // "Needs attention" opens from the dashboard, so it keeps the dashboard lit.
    { to: { name: 'admin-dashboard' }, label: 'Dashboard', always: true, exact: true, also: ['admin-attention'] },
    { to: { name: 'admin-admins' }, label: 'Admins', always: true },
    { to: { name: 'admin-restaurants' }, label: 'Restaurants', always: true },
    { to: { name: 'admin-customers' }, label: 'Customers', always: true },
    { to: { name: 'admin-drivers' }, label: 'Drivers', always: true },
    { to: { name: 'admin-orders' }, label: 'Orders', always: true },
    { to: { name: 'admin-discount-codes' }, label: 'Discount codes', always: true },
    { to: { name: 'admin-reviews' }, label: 'Reviews', always: true },
  ],
};

const items = computed(() => NAV[auth.role] ?? []);

// The cart badge needs the cart, whichever customer page is opened first.
function hydrateCart() {
  if (auth.role === 'CUSTOMER' && !cart.loaded) cart.load().catch(() => {});
}
onMounted(hydrateCart);

const ACTIVE_LINK = 'side-link-active !bg-surface font-medium !text-brand-700 shadow-card ring-1 ring-slate-200';

/**
 * An item stays highlighted on every page under it (Restaurants on "Add a
 * restaurant", Orders on an order's detail). Those routes are siblings, not
 * children, so RouterLink's own active class would miss them; the path is
 * compared instead. The dashboard is the section root, so every route would
 * match it as a prefix: it is highlighted only when it is the page itself, or
 * one of the pages named in its `also`.
 */
function isActive(item) {
  if (item.also?.includes(route.name)) return true;
  const path = router.resolve(item.to).path;
  return route.path === path || (!item.exact && route.path.startsWith(`${path}/`));
}

const ROLE_LABEL = { RESTAURANT: 'Restaurant', DRIVER: 'Driver', ADMIN: 'Admin', CUSTOMER: 'Customer' };
const STATUS_WORD = {
  PENDING_APPROVAL: 'pending approval', SUSPENDED: 'suspended', REJECTED: 'rejected', ACTIVE: 'active',
};
const statusWord = (status) => t(STATUS_WORD[status] ?? status.toLowerCase().replace('_', ' '));

/**
 * A restaurant awaiting approval keeps its operational links visible but
 * disabled, with the reason stated. A hidden menu item looks like a bug; a
 * disabled one with an explanation does not.
 */
const restaurantPending = computed(
  () => auth.role === 'RESTAURANT' && auth.restaurant && auth.restaurant.status !== 'ACTIVE',
);
const driverPending = computed(
  () => auth.role === 'DRIVER' && auth.driverProfile && auth.driverProfile.status !== 'ACTIVE',
);
const gated = computed(() => restaurantPending.value || driverPending.value);

const isDisabled = (item) => gated.value && !item.always;

const gateMessage = computed(() => {
  if (restaurantPending.value) {
    return auth.restaurant.status === 'PENDING_APPROVAL'
      ? t('Your restaurant is awaiting approval. Customers cannot see it yet, but you can finish your profile, hours and menu setup.')
      : t('Your restaurant is {status}. Operational screens are unavailable.', { status: statusWord(auth.restaurant.status) });
  }
  if (driverPending.value) {
    return t('Your driver account is {status}. You cannot receive deliveries yet.', { status: statusWord(auth.driverProfile.status) });
  }
  return null;
});

async function signOut() {
  menuOpen.value = false;
  await auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-shell flex min-h-screen flex-col bg-slate-50">
    <!-- Header and sidebar stay put; only the content scrolls under them. -->
    <div class="sticky top-0 z-30">
    <div class="app-accent-bar" aria-hidden="true" />
    <header class="app-header border-b border-slate-200 bg-surface backdrop-blur">
      <div class="mx-auto flex max-w-[88rem] items-center justify-between gap-2 px-4 py-2 md:py-3 lg:px-6">
        <div class="flex min-w-0 items-center gap-1">
          <MenuButton v-if="!isDesktop" :expanded="menuOpen" @toggle="menuOpen = !menuOpen" />
          <BrandLogo :collapsible="!isDesktop" />
        </div>

        <!-- Language, theme and sign-out are icons that stay in the bar at every
             width, so the drawer holds only navigation. -->
        <div class="flex min-w-0 items-center gap-1 text-sm lg:gap-2">
          <span v-if="isDesktop" class="me-1 hidden text-slate-600 lg:inline">
            {{ auth.user?.fullName }}
            <span class="ms-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{{ t(ROLE_LABEL[auth.role] ?? auth.role) }}</span>
          </span>
          <!-- Phones: the current section names itself where the links used to be. -->
          <span v-else class="me-1 truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 max-[379px]:hidden">
            {{ t(ROLE_LABEL[auth.role] ?? auth.role) }}
          </span>
          <LanguageToggle />
          <ThemeToggle />
          <SignOutButton @sign-out="signOut" />
        </div>
      </div>
    </header>
    </div>

    <MobileDrawer v-if="!isDesktop" :open="menuOpen" label="Menu" @close="menuOpen = false">
      <template #header>
        <BrandLogo />
      </template>

      <div class="mb-4 min-w-0 border-b border-slate-200 px-3 pb-4">
        <p class="truncate font-semibold text-slate-900">{{ auth.user?.fullName }}</p>
        <p class="text-xs text-slate-600">{{ t(ROLE_LABEL[auth.role] ?? auth.role) }}</p>
      </div>

      <nav :aria-label="t('Section')">
        <ul class="space-y-2.5">
          <li v-for="item in items" :key="item.label">
            <span v-if="isDisabled(item)"
                  class="ui-control ui-control-nav flex cursor-not-allowed items-center rounded-lg px-3 text-base text-slate-500"
                  aria-disabled="true">
              {{ t(item.label) }}
              <span class="sr-only">({{ t('unavailable') }}: {{ gateMessage }})</span>
            </span>
            <RouterLink v-else :to="item.to"
                        class="ui-control ui-control-nav side-link flex items-center rounded-lg px-3 text-base text-slate-800 transition-colors hover:bg-slate-100"
                        active-class="" exact-active-class="" :class="{ [ACTIVE_LINK]: isActive(item) }">
              {{ t(item.label) }}
              <span v-if="item.showsCart && cart.itemCount"
                    class="ms-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                {{ cart.itemCount }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </nav>
</MobileDrawer>

    <div class="mx-auto flex w-full max-w-[88rem] flex-1 flex-col gap-6 px-4 py-5 md:flex-row md:py-6 lg:px-6">
      <!-- top = header (4rem) + the 1.5rem gap above, so it pins where it starts. -->
      <nav v-if="isDesktop"
           class="sticky top-[5.5rem] max-h-[calc(100vh-7rem)] w-48 shrink-0 self-start overflow-y-auto lg:w-56"
           :aria-label="t('Section')">
        <ul class="flex flex-col gap-2">
          <li v-for="item in items" :key="item.label">
            <span v-if="isDisabled(item)"
                  class="block cursor-not-allowed whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-500"
                  :title="gateMessage" aria-disabled="true">
              {{ t(item.label) }}
              <span class="sr-only">({{ t('unavailable') }}: {{ gateMessage }})</span>
            </span>
            <RouterLink v-else :to="item.to"
                        class="side-link flex items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        active-class="" exact-active-class="" :class="{ [ACTIVE_LINK]: isActive(item) }">
              {{ t(item.label) }}
              <span v-if="item.showsCart && cart.itemCount"
                    class="ms-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                {{ cart.itemCount }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </nav>

      <main id="main" class="min-w-0 flex-1">
        <div v-if="gateMessage"
             class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
             role="status">
          {{ gateMessage }}
        </div>
        <RouterView />
      </main>
    </div>
  </div>
</template>
