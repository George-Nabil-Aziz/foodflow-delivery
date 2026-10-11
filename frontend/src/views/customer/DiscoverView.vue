<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { discoveryApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { cuisineStyle } from '../../utils/cuisine.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import RestaurantCard from '../../components/customer/RestaurantCard.vue';
import SearchAutocomplete from '../../components/customer/SearchAutocomplete.vue';

/** The signed-in home: search, cuisines and the best-rated restaurants. */
const auth = useAuthStore();
const cuisines = ref([]);
const topRated = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const [cuisineRes, topRes] = await Promise.all([
      discoveryApi.cuisines(),
      discoveryApi.listRestaurants({ sort: 'rating', order: 'desc', limit: 6 }),
    ]);
    cuisines.value = cuisineRes.data;
    topRated.value = topRes.data;
  } finally {
    loading.value = false;
  }
});

const firstName = () => auth.user?.fullName?.split(' ')[0] ?? '';

</script>

<template>
  <div>
    <!-- Not overflow-hidden itself: the search suggestions must be free to
         hang below the card. Only the decorative layer is clipped. -->
    <section class="relative z-10 rounded-2xl bg-gradient-to-br from-primary to-primary-hover px-5 py-10 text-center text-white shadow-raised sm:px-6 sm:py-16">
      <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden="true">
        <div class="absolute -end-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
        <div class="absolute -bottom-16 -start-10 h-56 w-56 rounded-full bg-white/10" />
      </div>

      <p v-if="firstName()" class="relative text-sm font-medium text-white/90">
        {{ t('Welcome back, {name}', { name: firstName() }) }}
      </p>
      <h1 class="relative mt-1 text-[clamp(1.625rem,1.1rem+2.6vw,2.25rem)] font-bold leading-tight">{{ t('Order from restaurants near you') }}</h1>
      <p class="relative mt-2 text-white/90">{{ t('Browse menus, track your order, and rate what you ate.') }}</p>

      <SearchAutocomplete id="home-search" class="mx-auto mt-6 max-w-xl" />
    </section>

    <AppSpinner v-if="loading" label="Loading restaurants" />

    <template v-else>
      <section v-if="cuisines.length" class="mt-10">
        <h2 class="section-title text-lg font-semibold text-slate-900">{{ t('Browse by cuisine') }}</h2>
        <div class="mt-4 flex flex-wrap gap-2">
          <RouterLink v-for="c in cuisines" :key="c.cuisineType"
                      :to="{ name: 'restaurants', query: { cuisine: c.cuisineType } }"
                      class="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-surface px-4 py-2 md:min-h-0 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:text-brand-800">
            <span aria-hidden="true">{{ cuisineStyle(c.cuisineType).icon }}</span>
            {{ t(cuisineStyle(c.cuisineType).label) }}
            <span class="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{{ c.restaurantCount }}</span>
          </RouterLink>
        </div>
      </section>

      <section class="mt-10">
        <div class="flex items-center justify-between">
          <h2 class="section-title text-lg font-semibold text-slate-900">{{ t('Top rated') }}</h2>
          <RouterLink to="/restaurants" class="action-link text-sm font-medium text-brand-700 hover:underline">
            {{ t('See all') }}
          </RouterLink>
        </div>
        <div class="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <RestaurantCard v-for="r in topRated" :key="r.id" :restaurant="r" />
        </div>
      </section>
    </template>
  </div>
</template>
