<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { discoveryApi } from '../../services/api.js';
import { useAddToCart } from '../../composables/useAddToCart.js';
import { formatMoney } from '../../utils/money.js';
import { UNAVAILABLE_REASON_LABEL } from '../../utils/orderStatus.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import RatingStars from '../../components/shared/RatingStars.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import { cuisineStyle } from '../../utils/cuisine.js';
import FoodItemCard from '../../components/customer/FoodItemCard.vue';
import FavouriteButton from '../../components/customer/FavouriteButton.vue';
import SwitchRestaurantDialog from '../../components/customer/SwitchRestaurantDialog.vue';
import { t } from '../../i18n/index.js';

const route = useRoute();
const router = useRouter();
const { adding, replacing, conflictOpen, conflict, add, keepCart, replaceCart } = useAddToCart(router);

const restaurant = ref(null);
const menu = ref([]);
const reviews = ref([]);
const loading = ref(true);
const error = ref(null);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const id = route.params.id;
    const [detail, menuRes, reviewRes] = await Promise.all([
      discoveryApi.getRestaurant(id),
      discoveryApi.getMenu(id),
      discoveryApi.getReviews(id, { limit: 5 }).catch(() => ({ data: [] })),
    ]);
    restaurant.value = detail.data;
    menu.value = menuRes.data;
    reviews.value = reviewRes.data;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <AppSpinner v-if="loading" label="Loading restaurant" />

    <ErrorState v-else-if="error"
                :message="error.status === 404
                  ? 'This restaurant is no longer available.'
                  : error.message"
                :retryable="error.status !== 404"
                @retry="load" />

    <template v-else-if="restaurant">
      <header class="card overflow-hidden">
        <div class="h-40">
          <img v-if="restaurant.coverImageUrl" :src="restaurant.coverImageUrl" alt=""
               class="h-full w-full object-cover">
          <div v-else :class="`cuisine-cover ${cuisineStyle(restaurant.cuisineType).cover} flex h-full items-center justify-center`">
            <span class="relative z-10 text-6xl drop-shadow-md" aria-hidden="true">{{ cuisineStyle(restaurant.cuisineType).icon }}</span>
          </div>
        </div>
        <div class="p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 class="text-2xl font-bold text-slate-900">{{ restaurant.name }}</h1>
              <p class="mt-1 text-sm uppercase tracking-wide text-slate-500">
                {{ t(cuisineStyle(restaurant.cuisineType).label) }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="!restaurant.isOrderable"
                    class="rounded-full border border-slate-400 bg-slate-100 px-3 py-1 text-sm text-slate-800">
                {{ t(UNAVAILABLE_REASON_LABEL[restaurant.unavailableReason] || 'Not available') }}
              </span>
              <FavouriteButton v-if="restaurant.isFavourite !== undefined" kind="restaurant"
                               :id="restaurant.id" :name="restaurant.name" :favourite="restaurant.isFavourite" />
            </div>
          </div>

          <p v-if="restaurant.description" class="mt-3 text-slate-700">{{ restaurant.description }}</p>

          <!-- Not just a disabled button: say why, and what to do about it. -->
          <p v-if="restaurant.deliversToAddress === false" role="alert"
             class="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            <strong>{{ t("Doesn't deliver to your address") }}</strong>
            {{ t('Your address is {distance} km away and this restaurant delivers within {radius} km. Choose another address or restaurant.', {
              distance: restaurant.distanceKm, radius: Number(restaurant.deliveryRadiusKm),
            }) }}
          </p>

          <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
<dt class="text-slate-500">{{ t('Rating') }}</dt>
              <dd class="font-medium">
                <template v-if="restaurant.ratingCount">
                  {{ Number(restaurant.ratingAverage).toFixed(2) }} ({{ restaurant.ratingCount }})
                </template>
                <template v-else>{{ t('New') }}</template>
              </dd>
            </div>
            <div><dt class="text-slate-500">{{ t('Delivery') }}</dt><dd class="font-medium">{{ formatMoney(restaurant.deliveryFee) }}</dd></div>
            <div><dt class="text-slate-500">{{ t('Minimum') }}</dt><dd class="font-medium">{{ formatMoney(restaurant.minimumOrderAmount) }}</dd></div>
            <div><dt class="text-slate-500">{{ t('Prep time') }}</dt><dd class="font-medium">{{ t('{n} min', { n: restaurant.avgPreparationMinutes }) }}</dd></div>
            <div><dt class="text-slate-500">{{ t('Delivers within') }}</dt><dd class="font-medium">{{ t('{n} km', { n: Number(restaurant.deliveryRadiusKm) }) }}</dd></div>
          </dl>
        </div>
      </header>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
          <h2 class="text-lg font-semibold text-slate-900">{{ t('Menu') }}</h2>

          <EmptyState v-if="menu.length === 0" class="mt-3"
                      title="Menu coming soon"
                      message="This restaurant has not published its menu yet." />

          <div v-for="category in menu" :key="category.id" class="mt-5">
            <h3 class="text-base font-semibold text-slate-800">{{ category.name }}</h3>
            <p v-if="category.description" class="text-sm text-slate-600">{{ category.description }}</p>
            <div class="mt-3 space-y-3">
              <FoodItemCard v-for="item in category.items" :key="item.id" :item="item"
                            :restaurant-orderable="restaurant.isOrderable"
                            :deliverable="restaurant.deliversToAddress !== false"
                            :adding="adding === item.id" @add="add" />
            </div>
          </div>
        </section>

        <aside class="space-y-6">
          <div class="card p-4">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ t('Opening hours') }}</h2>
            <ul class="mt-3 space-y-1 text-sm">
              <li v-for="h in restaurant.hours" :key="h.dayOfWeek" class="flex justify-between">
                <span class="text-slate-600">{{ t(DAYS[h.dayOfWeek]) }}</span>
                <span class="font-medium text-slate-800">
                  {{ h.isClosed ? t('Closed') : `${h.opensAt} - ${h.closesAt}` }}
                </span>
              </li>
            </ul>
          </div>

          <div class="card p-4">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ t('Recent reviews') }}</h2>
            <p v-if="reviews.length === 0" class="mt-3 text-sm text-slate-600">{{ t('No reviews yet.') }}</p>
            <ul v-else class="mt-3 space-y-3">
              <li v-for="review in reviews" :key="review.id" class="border-b border-slate-100 pb-3 last:border-0">
                <p class="text-sm font-medium text-slate-800">
                  <RatingStars :value="review.restaurantRating" />
                  <span class="ms-1 font-normal text-slate-500">{{ review.customer.displayName }}</span>
                </p>
                <p v-if="review.comment" class="mt-1 text-sm text-slate-600">{{ review.comment }}</p>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </template>

    <SwitchRestaurantDialog :open="conflictOpen" :conflict="conflict" :replacing="replacing"
                            @keep="keepCart" @replace="replaceCart" />
  </div>
</template>
