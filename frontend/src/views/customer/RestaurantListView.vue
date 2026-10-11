<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { discoveryApi } from '../../services/api.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import AppButton from '../../components/shared/AppButton.vue';
import RestaurantCard from '../../components/customer/RestaurantCard.vue';
import { cuisineStyle } from '../../utils/cuisine.js';
import { t } from '../../i18n/index.js';

const route = useRoute();
const router = useRouter();

const restaurants = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const cuisines = ref([]);
const loading = ref(true);
const error = ref(null);

/**
 * Filter state lives in the URL, so a filtered list is shareable and survives a
 * reload and the browser Back button.
 */
const filters = computed(() => ({
  q: route.query.q ?? '',
  cuisine: route.query.cuisine ?? '',
  openNow: route.query.openNow === 'true',
  minRating: route.query.minRating ?? '',
  sort: route.query.sort ?? 'rating',
  order: route.query.order ?? 'desc',
  page: Number(route.query.page ?? 1),
}));

const hasFilters = computed(
  () => Boolean(filters.value.q || filters.value.cuisine || filters.value.openNow || filters.value.minRating),
);

function setFilter(patch) {
  const next = { ...route.query, ...patch };
  // Changing a filter resets to the first page; otherwise page 3 of the old
  // result set silently becomes an empty page of the new one.
  if (!('page' in patch)) delete next.page;
  for (const [key, value] of Object.entries(next)) {
    if (value === '' || value === false || value === null || value === undefined) delete next[key];
  }
  router.push({ name: 'restaurants', query: next });
}

const clearFilters = () => router.push({ name: 'restaurants', query: {} });

// Debounced search: 300 ms, and only fires from two characters.
let searchTimer = null;
function onSearchInput(event) {
  const value = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (value.length === 0 || value.length >= 2) setFilter({ q: value });
  }, 300);
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const params = { page: filters.value.page, limit: 12, sort: filters.value.sort, order: filters.value.order };
    if (filters.value.q) params.q = filters.value.q;
    if (filters.value.cuisine) params.cuisine = filters.value.cuisine;
    if (filters.value.openNow) params.openNow = 'true';
    if (filters.value.minRating) params.minRating = filters.value.minRating;

    const res = await discoveryApi.listRestaurants(params);
    restaurants.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  cuisines.value = (await discoveryApi.cuisines().catch(() => ({ data: [] }))).data;
  load();
});
watch(() => route.query, load);
</script>

<template>
  <div class="flex flex-col gap-6 lg:flex-row">
    <aside class="lg:w-64 lg:shrink-0">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ t('Filters') }}</h2>

      <div class="mt-3 space-y-4">
        <div>
          <label for="filter-search" class="field-label">{{ t('Search') }}</label>
          <input id="filter-search" type="search" class="field-input"
                 :value="filters.q" :placeholder="t('Restaurant or dish')" @input="onSearchInput">
        </div>

        <div>
          <label for="filter-cuisine" class="field-label">{{ t('Cuisine') }}</label>
          <select id="filter-cuisine" class="field-input" :value="filters.cuisine"
                  @change="setFilter({ cuisine: $event.target.value })">
            <option value="">{{ t('All cuisines') }}</option>
            <option v-for="c in cuisines" :key="c.cuisineType" :value="c.cuisineType">
              {{ t(cuisineStyle(c.cuisineType).label) }} ({{ c.restaurantCount }})
            </option>
          </select>
        </div>

        <div>
          <label for="filter-rating" class="field-label">{{ t('Minimum rating') }}</label>
          <select id="filter-rating" class="field-input" :value="filters.minRating"
                  @change="setFilter({ minRating: $event.target.value })">
            <option value="">{{ t('Any rating') }}</option>
            <option v-for="n in [4, 3, 2]" :key="n" :value="n">{{ t('{n} stars and up', { n }) }}</option>
          </select>
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" :checked="filters.openNow"
                 @change="setFilter({ openNow: $event.target.checked })">
          {{ t('Open now') }}
        </label>

        <div>
          <label for="filter-sort" class="field-label">{{ t('Sort by') }}</label>
          <select id="filter-sort" class="field-input" :value="filters.sort"
                  @change="setFilter({ sort: $event.target.value })">
            <option value="rating">{{ t('Rating') }}</option>
            <option value="deliveryFee">{{ t('Delivery fee') }}</option>
            <option value="name">{{ t('Name') }}</option>
            <option value="newest">{{ t('Newest') }}</option>
          </select>
        </div>

        <AppButton v-if="hasFilters" variant="secondary" size="sm" class="w-full" @click="clearFilters">
          {{ t('Clear filters') }}
        </AppButton>
      </div>
    </aside>

    <section class="min-w-0 flex-1">
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Restaurants') }}</h1>

      <AppSpinner v-if="loading" label="Loading restaurants" />
      <ErrorState v-else-if="error" :message="error.message" @retry="load" />

      <!-- An empty result is not an error, and it offers a way forward. -->
      <EmptyState v-else-if="restaurants.length === 0"
                  title="No restaurants match these filters"
                  message="Try widening your search or clearing the filters.">
        <AppButton v-if="hasFilters" variant="secondary" @click="clearFilters">{{ t('Clear filters') }}</AppButton>
      </EmptyState>

      <template v-else>
        <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <RestaurantCard v-for="r in restaurants" :key="r.id" :restaurant="r" />
        </div>
        <AppPagination :pagination="pagination" @change="(page) => setFilter({ page })" />
      </template>
    </section>
  </div>
</template>
