<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { discoveryApi } from '../../services/api.js';
import { cuisineStyle } from '../../utils/cuisine.js';
import { t, isRtl } from '../../i18n/index.js';
import RestaurantCard from '../../components/customer/RestaurantCard.vue';
import SearchAutocomplete from '../../components/customer/SearchAutocomplete.vue';

/**
 * The front door for visitors who are not signed in. It explains the product
 * and leads to sign-up, while browsing stays open to everyone: the menu is
 * public, only ordering needs an account.
 */
const cuisines = ref([]);
const featured = ref([]);
const rail = ref(null);

/**
 * Pages the "Popular right now" rail by most of its width. Touch users swipe;
 * the arrows are for a mouse. In Arabic the rail runs right to left, so
 * "next" scrolls the other way.
 */
function scrollRail(direction) {
  const el = rail.value;
  if (!el) return;
  el.scrollBy({ left: el.clientWidth * 0.85 * direction * (isRtl.value ? -1 : 1), behavior: 'smooth' });
}

onMounted(async () => {
  // The page is useful without this data, so a failure only hides sections.
  try {
    const [cuisineRes, topRes] = await Promise.all([
      discoveryApi.cuisines(),
      discoveryApi.listRestaurants({ sort: 'rating', order: 'desc', limit: 10 }),
    ]);
    cuisines.value = cuisineRes.data;
    featured.value = topRes.data;
  } catch {
    cuisines.value = [];
    featured.value = [];
  }
});


const STEPS = [
  { icon: '🔍', title: 'Pick a restaurant', text: 'Browse local menus by cuisine, rating or delivery fee.', tone: 'bg-brand-100 text-brand-800' },
  { icon: '🛒', title: 'Place your order', text: 'Add dishes to your cart and check out in a few taps.', tone: 'bg-amber-100 text-amber-900' },
  { icon: '🛵', title: 'Track it to your door', text: 'Follow every step, from the kitchen to the driver.', tone: 'bg-teal-100 text-teal-900' },
];

const AUDIENCES = [
  {
    icon: '🍽️', title: 'For customers', tone: 'border-brand-200 bg-brand-50',
    text: 'Order from the best local kitchens and rate what you ate.',
    cta: 'Create an account', to: { name: 'register' },
  },
  {
    icon: '👩‍🍳', title: 'For restaurants', tone: 'border-teal-200 bg-teal-50',
    text: 'List your menu, accept orders and watch your sales grow.',
    cta: 'Register your restaurant', to: { name: 'register' },
  },
  {
    icon: '🛵', title: 'For drivers', tone: 'border-violet-200 bg-violet-50',
    text: 'Driver accounts are set up by the FoodFlow operations team.',
    cta: null,
  },
];
</script>

<template>
  <div class="space-y-16 sm:space-y-20">
    <!-- Hero -->
    <!-- Not overflow-hidden itself: the search suggestions must be free to
         hang below the card. Only the decorative layer is clipped. -->
    <section class="relative z-10 rounded-2xl bg-gradient-to-br from-primary to-primary-hover px-5 py-10 text-white shadow-raised sm:rounded-3xl sm:px-10 sm:py-16">
      <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden="true">
        <div class="absolute -end-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div class="absolute -bottom-24 start-1/3 h-72 w-72 rounded-full bg-white/5" />
      </div>

      <div class="relative grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p class="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
            <span aria-hidden="true">⚡</span> {{ t('Fresh food, delivered fast') }}
          </p>
          <h1 class="mt-4 text-[clamp(1.875rem,1.2rem+3.4vw,3rem)] font-extrabold leading-tight">
            {{ t('Your favourite local food, at your door') }}
          </h1>
          <p class="mt-4 max-w-lg text-base text-white/90 sm:text-lg">
            {{ t('Discover restaurants near you, order in minutes, and follow your meal all the way from the kitchen.') }}
          </p>

          <SearchAutocomplete id="landing-search" rounded="rounded-xl" class="mt-8 max-w-lg" />

          <div class="mt-6 grid gap-3 min-[400px]:flex min-[400px]:flex-wrap">
            <RouterLink :to="{ name: 'restaurants' }"
                        class="rounded-xl bg-white px-5 py-3 text-center font-semibold text-orange-800 shadow-sm transition hover:bg-orange-50">
              {{ t('Browse restaurants') }}
            </RouterLink>
            <RouterLink :to="{ name: 'register' }"
                        class="rounded-xl border border-white/60 px-5 py-3 text-center font-semibold text-white transition hover:bg-white/10">
              {{ t('Create an account') }}
            </RouterLink>
          </div>
        </div>

        <!-- Decorative: a fan of cuisine covers. -->
        <div class="hidden lg:block" aria-hidden="true">
          <div class="grid grid-cols-3 gap-4">
            <div v-for="(type, i) in ['EGYPTIAN', 'ITALIAN', 'SEAFOOD', 'DESSERTS', 'BURGERS', 'ASIAN']" :key="type"
                 :class="`cuisine-cover ${cuisineStyle(type).cover} flex aspect-square items-center justify-center rounded-2xl text-5xl shadow-lg ring-1 ring-white/20 ${i % 2 ? 'translate-y-6' : ''}`">
              <span class="relative z-10">{{ cuisineStyle(type).icon }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section>
      <div class="text-center">
        <h2 class="text-2xl font-bold text-slate-900 sm:text-3xl">{{ t('How it works') }}</h2>
        <p class="mt-2 text-slate-600">{{ t('Three steps between you and a good meal.') }}</p>
      </div>
      <ol class="mt-8 grid gap-5 sm:grid-cols-3">
        <li v-for="(step, i) in STEPS" :key="step.title" class="card p-6">
          <div class="flex items-center gap-3">
            <span :class="`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${step.tone}`" aria-hidden="true">
              {{ step.icon }}
            </span>
            <span class="text-sm font-semibold text-slate-500">{{ t('Step {n}', { n: i + 1 }) }}</span>
          </div>
          <h3 class="mt-4 text-lg font-semibold text-slate-900">{{ t(step.title) }}</h3>
          <p class="mt-1 text-sm text-slate-600">{{ t(step.text) }}</p>
        </li>
      </ol>
    </section>

    <!-- Cuisines -->
    <section v-if="cuisines.length">
      <h2 class="section-title text-2xl font-bold text-slate-900">{{ t('Browse by cuisine') }}</h2>
      <div class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <RouterLink v-for="c in cuisines" :key="c.cuisineType"
                    :to="{ name: 'restaurants', query: { cuisine: c.cuisineType } }"
                    :class="`cuisine-cover ${cuisineStyle(c.cuisineType).cover} group flex h-28 flex-col items-center justify-center rounded-2xl text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-raised`">
          <span class="relative z-10 text-3xl transition-transform group-hover:scale-110" aria-hidden="true">
            {{ cuisineStyle(c.cuisineType).icon }}
          </span>
          <span class="relative z-10 mt-1 font-semibold">{{ t(cuisineStyle(c.cuisineType).label) }}</span>
          <span class="relative z-10 text-xs text-white/90">
            {{ t('{n} restaurants', { n: c.restaurantCount }) }}
          </span>
        </RouterLink>
      </div>
    </section>

    <!-- Featured -->
    <section v-if="featured.length">
      <div class="flex items-end justify-between gap-4">
        <h2 class="section-title text-2xl font-bold text-slate-900">{{ t('Popular right now') }}</h2>
        <div class="flex items-center gap-2">
          <RouterLink :to="{ name: 'restaurants' }" class="action-link me-1 text-sm font-semibold text-brand-700 hover:underline">
            {{ t('See all') }}
          </RouterLink>
          <!-- Arrows for a mouse; a finger or trackpad just swipes the rail. -->
          <button v-for="dir in [-1, 1]" :key="dir" type="button"
                  class="hidden h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-surface text-slate-700 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-800 md:inline-flex"
                  :aria-label="dir < 0 ? t('Scroll left') : t('Scroll right')" @click="scrollRail(dir)">
            <svg class="h-5 w-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :d="dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'" />
            </svg>
          </button>
        </div>
      </div>
      <!--
        A horizontal rail: cards keep their width and the row scrolls,
        snapping card by card. It bleeds to the screen edge on a phone so the
        next card peeks in, which is what tells a thumb there is more.
      -->
      <ul ref="rail" :aria-label="t('Popular right now')"
          class="rail -mx-4 mt-6 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 sm:gap-5 lg:-mx-6 lg:scroll-px-6 lg:px-6">
        <li v-for="r in featured" :key="r.id" class="w-[min(18rem,78vw)] shrink-0 snap-start">
          <RestaurantCard :restaurant="r" class="h-full" />
        </li>
      </ul>
    </section>

    <!-- Audiences -->
    <section>
      <h2 class="text-center text-2xl font-bold text-slate-900 sm:text-3xl">{{ t('Made for everyone at the table') }}</h2>
      <div class="mt-8 grid gap-5 md:grid-cols-3">
        <div v-for="a in AUDIENCES" :key="a.title" :class="`rounded-2xl border p-6 ${a.tone}`">
          <span class="text-3xl" aria-hidden="true">{{ a.icon }}</span>
          <h3 class="mt-3 text-lg font-semibold text-slate-900">{{ t(a.title) }}</h3>
          <p class="mt-1 text-sm text-slate-700">{{ t(a.text) }}</p>
          <RouterLink v-if="a.cta" :to="a.to"
                      class="action-link mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">
            {{ t(a.cta) }} <span aria-hidden="true" class="inline-block rtl:rotate-180">&rarr;</span>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Closing call to action -->
    <section class="rounded-2xl bg-slate-900 px-5 py-10 text-center text-slate-50 sm:rounded-3xl sm:py-14">
      <h2 class="text-2xl font-bold sm:text-3xl">{{ t('Hungry already?') }}</h2>
      <p class="mt-2 text-slate-300">{{ t('Create an account in under a minute and place your first order.') }}</p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <RouterLink :to="{ name: 'register' }"
                    class="btn-primary rounded-xl bg-primary px-6 py-3 font-semibold text-white transition-colors hover:bg-primary-hover">
          {{ t('Get started') }}
        </RouterLink>
        <RouterLink :to="{ name: 'restaurants' }"
                    class="rounded-xl border border-slate-600 px-6 py-3 font-semibold text-slate-50 transition-colors hover:bg-slate-800">
          {{ t('Browse restaurants') }}
        </RouterLink>
      </div>
    </section>
  </div>
</template>
