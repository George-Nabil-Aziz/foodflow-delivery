<script setup>
import { ref, onMounted, watch } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.store.js';
import { useCartStore } from '../stores/cart.store.js';
import { homeFor } from '../router/index.js';
import BrandLogo from '../components/shared/BrandLogo.vue';
import ThemeToggle from '../components/shared/ThemeToggle.vue';
import LanguageToggle from '../components/shared/LanguageToggle.vue';
import MobileDrawer from '../components/shared/MobileDrawer.vue';
import MenuButton from '../components/shared/MenuButton.vue';
import { useIsDesktop } from '../composables/useMediaQuery.js';
import { t } from '../i18n/index.js';

const navLink = 'nav-link rounded-lg px-3 py-2 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900';
const navActive = 'nav-link-active bg-slate-100 font-medium text-slate-900';
// In the drawer every link is a full-width, 48px row: sized for a thumb.
const drawerLink = 'nav-link flex min-h-12 w-full items-center rounded-lg px-3 text-base text-slate-800 transition-colors hover:bg-slate-100';

const auth = useAuthStore();
const cart = useCartStore();
const router = useRouter();
const isDesktop = useIsDesktop();
const menuOpen = ref(false);

/**
 * The badge lives here, so the hydration belongs here too.
 *
 * The public routes - including the restaurant menu, where items are actually
 * added - render this layout directly. Loading the cart only in CustomerLayout
 * meant a signed-in customer who reloaded the menu saw an empty badge until
 * they happened to visit /cart or /orders.
 */
function hydrateCart() {
  if (auth.isAuthenticated && auth.role === 'CUSTOMER' && !cart.loaded) {
    cart.load().catch(() => {});
  }
}

onMounted(hydrateCart);
// Signing in mid-session is the other way a customer arrives here with a cart.
watch(() => auth.isAuthenticated, hydrateCart);
// Growing past the breakpoint with the drawer open would strand it open.
watch(isDesktop, (desktop) => { if (desktop) menuOpen.value = false; });

function signOut() {
  menuOpen.value = false;
  return auth.logout().then(() => router.push('/'));
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="app-accent-bar" aria-hidden="true" />
    <header class="app-header border-b border-slate-200 bg-surface/90 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 md:py-3 lg:px-6">
        <BrandLogo />

        <!-- Tablet and up: the full navigation in the bar. -->
        <nav v-if="isDesktop" class="flex flex-wrap items-center justify-end gap-x-1 gap-y-1 text-sm lg:gap-x-2"
             :aria-label="t('Main')">
          <RouterLink to="/restaurants" :class="navLink" :active-class="navActive">{{ t('Restaurants') }}</RouterLink>

          <template v-if="auth.isAuthenticated && auth.role === 'CUSTOMER'">
            <RouterLink to="/orders" :class="navLink" :active-class="navActive">{{ t('My orders') }}</RouterLink>
            <RouterLink to="/cart" :class="`relative ${navLink}`" :active-class="navActive">
              {{ t('Cart') }}
              <span v-if="cart.itemCount" class="ms-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                {{ cart.itemCount }}
              </span>
            </RouterLink>
          </template>

          <RouterLink v-if="auth.isAuthenticated && auth.role !== 'CUSTOMER'"
                      :to="homeFor(auth.role)" :class="navLink">
            {{ t('Dashboard') }}
          </RouterLink>

          <template v-if="auth.isAuthenticated">
            <RouterLink v-if="auth.role === 'CUSTOMER'" to="/account/profile"
                        :class="navLink" :active-class="navActive">
              {{ t('Account') }}
            </RouterLink>
            <button type="button" :class="navLink" @click="signOut">
              {{ t('Sign out') }}
            </button>
          </template>
          <template v-else>
            <RouterLink to="/login" :class="navLink" :active-class="navActive">{{ t('Sign in') }}</RouterLink>
            <RouterLink to="/register"
                        class="btn-primary rounded-lg bg-primary px-3 py-2 font-medium text-white shadow-sm transition-colors hover:bg-primary-hover">
              {{ t('Sign up') }}
            </RouterLink>
          </template>
          <LanguageToggle />
          <ThemeToggle />
        </nav>

        <!--
          Phones: the cart stays one tap away in the bar, because it is what a
          customer reaches for mid-order; everything else lives in the drawer.
        -->
        <div v-else class="flex items-center gap-1">
          <RouterLink v-if="auth.isAuthenticated && auth.role === 'CUSTOMER'" to="/cart"
                      class="nav-link relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
              <circle cx="10" cy="20" r="1.3" />
              <circle cx="17" cy="20" r="1.3" />
            </svg>
            <span class="sr-only">{{ t('Cart') }}</span>
            <span v-if="cart.itemCount"
                  class="absolute -end-0.5 -top-0.5 min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-semibold leading-5 text-white">
              {{ cart.itemCount }}
            </span>
          </RouterLink>
          <RouterLink v-if="!auth.isAuthenticated" to="/register"
                      class="btn-primary inline-flex min-h-11 items-center rounded-lg bg-primary px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-hover">
            {{ t('Sign up') }}
          </RouterLink>
          <MenuButton :expanded="menuOpen" @toggle="menuOpen = !menuOpen" />
        </div>
      </div>
    </header>

    <MobileDrawer v-if="!isDesktop" :open="menuOpen" label="Menu" @close="menuOpen = false">
      <template #header>
        <BrandLogo />
      </template>

      <nav :aria-label="t('Main')">
        <ul class="space-y-1">
          <li>
            <RouterLink to="/restaurants" :class="drawerLink" :active-class="navActive">{{ t('Restaurants') }}</RouterLink>
          </li>
          <template v-if="auth.isAuthenticated && auth.role === 'CUSTOMER'">
            <li>
              <RouterLink to="/orders" :class="drawerLink" :active-class="navActive">{{ t('My orders') }}</RouterLink>
            </li>
            <li>
              <RouterLink to="/account/profile" :class="drawerLink" :active-class="navActive">{{ t('Account') }}</RouterLink>
            </li>
          </template>
          <li v-if="auth.isAuthenticated && auth.role !== 'CUSTOMER'">
            <RouterLink :to="homeFor(auth.role)" :class="drawerLink">{{ t('Dashboard') }}</RouterLink>
          </li>
          <li v-if="!auth.isAuthenticated">
            <RouterLink to="/login" :class="drawerLink" :active-class="navActive">{{ t('Sign in') }}</RouterLink>
          </li>
        </ul>
      </nav>

      <template #footer>
        <div class="flex items-center justify-between gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <button v-if="auth.isAuthenticated" type="button"
                class="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg border border-slate-300 text-base font-medium text-slate-800 transition-colors hover:bg-slate-100"
                @click="signOut">
          {{ t('Sign out') }}
        </button>
      </template>
    </MobileDrawer>

    <main id="main" class="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:py-6 lg:px-6">
      <RouterView />
    </main>

    <footer class="app-footer border-t border-slate-200 bg-surface px-4 py-6 text-center text-xs text-slate-500">
      FoodFlow &middot; {{ t('a demonstration food delivery platform') }}
    </footer>
  </div>
</template>
