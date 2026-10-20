<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.store.js';
import { homeFor } from '../router/index.js';
import BrandLogo from '../components/shared/BrandLogo.vue';
import ThemeToggle from '../components/shared/ThemeToggle.vue';
import LanguageToggle from '../components/shared/LanguageToggle.vue';
import MobileDrawer from '../components/shared/MobileDrawer.vue';
import MenuButton from '../components/shared/MenuButton.vue';
import SignOutButton from '../components/shared/SignOutButton.vue';
import { useIsDesktop } from '../composables/useMediaQuery.js';
import { t } from '../i18n/index.js';

const navLink = 'nav-link rounded-lg px-3 py-2 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900';
const navActive = 'nav-link-active bg-slate-100 font-medium text-slate-900';
// In the drawer every link is a full-width, 48px row: sized for a thumb.
const drawerLink = 'ui-control ui-control-nav nav-link flex w-full items-center rounded-lg px-3 text-base text-slate-800 transition-colors hover:bg-slate-100';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
// Restaurants is for browsing before signing in, and the list never links to
// itself; signed in, the logo leads home.
const showRestaurantsLink = computed(() => !auth.isAuthenticated && route.path !== '/restaurants');
const isDesktop = useIsDesktop();
const menuOpen = ref(false);

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
        <BrandLogo :collapsible="!isDesktop" />

        <!-- Tablet and up: the full navigation in the bar. -->
        <nav v-if="isDesktop" class="flex flex-wrap items-center justify-end gap-x-1 gap-y-1 text-sm lg:gap-x-2"
             :aria-label="t('Main')">
          <RouterLink v-if="showRestaurantsLink" to="/restaurants" :class="navLink" :active-class="navActive">{{ t('Restaurants') }}</RouterLink>

          <RouterLink v-if="auth.isAuthenticated && auth.role !== 'CUSTOMER'"
                      :to="homeFor(auth.role)" :class="navLink">
            {{ t('Dashboard') }}
          </RouterLink>

          <!-- Sign up is offered on the sign-in page itself, under the form. -->
          <RouterLink v-if="!auth.isAuthenticated" to="/login" :class="navLink" :active-class="navActive">{{ t('Sign in') }}</RouterLink>
          <LanguageToggle />
          <ThemeToggle />
          <SignOutButton v-if="auth.isAuthenticated" @sign-out="signOut" />
        </nav>

        <!-- Phones: sign-in stays in the bar; everything else lives in the drawer.
             A signed-in customer never sees this header: their pages, the public
             ones included, render in the sidebar shell (SiteLayout). -->
        <div v-else class="flex items-center gap-1">
          <RouterLink v-if="!auth.isAuthenticated" to="/login"
                      class="nav-link inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
            {{ t('Sign in') }}
          </RouterLink>
          <!-- Language, theme and sign-out stay in the bar as icons; the drawer is navigation only. -->
          <LanguageToggle />
          <ThemeToggle />
          <SignOutButton v-if="auth.isAuthenticated" @sign-out="signOut" />
          <MenuButton :expanded="menuOpen" @toggle="menuOpen = !menuOpen" />
        </div>
      </div>
    </header>

    <MobileDrawer v-if="!isDesktop" :open="menuOpen" label="Menu" @close="menuOpen = false">
      <template #header>
        <BrandLogo />
      </template>

      <nav :aria-label="t('Main')">
        <ul class="space-y-2.5">
          <li v-if="showRestaurantsLink">
            <RouterLink to="/restaurants" :class="drawerLink" :active-class="navActive">{{ t('Restaurants') }}</RouterLink>
          </li>
          <li v-if="auth.isAuthenticated && auth.role !== 'CUSTOMER'">
            <RouterLink :to="homeFor(auth.role)" :class="drawerLink">{{ t('Dashboard') }}</RouterLink>
          </li>
          <li v-if="!auth.isAuthenticated">
            <RouterLink to="/login" :class="drawerLink" :active-class="navActive">{{ t('Sign in') }}</RouterLink>
          </li>
        </ul>
      </nav>
</MobileDrawer>

    <main id="main" class="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:py-6 lg:px-6">
      <RouterView />
    </main>

    <footer class="app-footer border-t border-slate-200 bg-surface px-4 py-6 text-center text-xs text-slate-500">
      FoodFlow &middot; {{ t('a demonstration food delivery platform') }}
    </footer>
  </div>
</template>
