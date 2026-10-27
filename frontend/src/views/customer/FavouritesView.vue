<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { favouriteApi } from '../../services/api.js';
import { formatMoney } from '../../utils/money.js';
import { tileClass } from '../../utils/cuisine.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import RestaurantCard from '../../components/customer/RestaurantCard.vue';
import FavouriteButton from '../../components/customer/FavouriteButton.vue';

/**
 * A customer's shortlist (spec-16). Nothing is hidden: a restaurant that is
 * closed or off the platform, and an item that is unavailable or gone, stay on
 * the page and say so, so a favourite never silently disappears.
 */
const restaurants = ref([]);
const items = ref([]);
const loading = ref(true);
const error = ref(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await favouriteApi.list();
    restaurants.value = data.restaurants;
    items.value = data.items;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// Un-hearting removes the entry from the page, which is what "unfavourite" means here.
const dropRestaurant = (id) => { restaurants.value = restaurants.value.filter((r) => r.id !== id); };
const dropItem = (id) => { items.value = items.value.filter((i) => i.id !== id); };
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Favourites') }}</h1>

    <AppSpinner v-if="loading" label="Loading favourites" />
    <ErrorState v-else-if="error" :message="error.message" @retry="load" />

    <template v-else>
      <EmptyState v-if="restaurants.length === 0 && items.length === 0" class="mt-4"
                  title="No favourites yet"
                  message="Tap the heart on a restaurant or a dish to keep it here.">
        <RouterLink :to="{ name: 'restaurants' }"
                    class="ui-control inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          {{ t('Browse restaurants') }}
        </RouterLink>
      </EmptyState>

      <section v-if="restaurants.length" class="mt-5" aria-labelledby="fav-restaurants">
        <h2 id="fav-restaurants" class="text-lg font-semibold text-slate-900">{{ t('Favourite restaurants') }}</h2>
        <div class="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <RestaurantCard v-for="r in restaurants" :key="r.id" :restaurant="r"
                          @favourite-change="(on) => { if (!on) dropRestaurant(r.id); }" />
        </div>
      </section>

      <section v-if="items.length" class="mt-8" aria-labelledby="fav-items">
        <h2 id="fav-items" class="text-lg font-semibold text-slate-900">{{ t('Favourite dishes') }}</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="item in items" :key="item.id" class="card flex items-start gap-4 p-4"
              :class="!item.isAvailable ? 'bg-slate-50' : ''">
            <img v-if="item.imageUrl" :src="item.imageUrl" alt="" class="h-16 w-16 shrink-0 rounded-xl object-cover">
            <div v-else :class="`${tileClass(item.name)} flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold`"
                 aria-hidden="true">
              {{ item.name.charAt(0) }}
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-slate-900">{{ item.name }}</h3>
              <p class="mt-0.5 text-sm text-slate-600">
                {{ t('from') }}
                <RouterLink v-if="item.restaurant.isBrowsable"
                            :to="{ name: 'restaurant-detail', params: { id: item.restaurant.id } }"
                            class="font-medium text-brand-700 hover:underline">
                  {{ item.restaurant.name }}
                </RouterLink>
                <span v-else class="font-medium text-slate-700">{{ item.restaurant.name }}</span>
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-bold text-brand-800">
                  {{ formatMoney(item.price) }}
                </span>
                <!-- Stated as text, never by styling alone. -->
                <span v-if="!item.isAvailable" class="text-sm font-medium text-slate-700">{{ t('Unavailable') }}</span>
                <RouterLink v-else :to="{ name: 'restaurant-detail', params: { id: item.restaurant.id } }"
                            class="text-sm font-medium text-brand-700 hover:underline">
                  {{ t('View menu') }}
                </RouterLink>
              </div>
            </div>

            <FavouriteButton kind="item" :id="item.id" :name="item.name" :favourite="true"
                             @change="(on) => { if (!on) dropItem(item.id); }" />
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
