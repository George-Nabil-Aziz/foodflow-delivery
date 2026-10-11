<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { formatMoney } from '../../utils/money.js';
import { UNAVAILABLE_REASON_LABEL } from '../../utils/orderStatus.js';
import { cuisineStyle } from '../../utils/cuisine.js';
import { t } from '../../i18n/index.js';

const props = defineProps({ restaurant: { type: Object, required: true } });
const style = computed(() => cuisineStyle(props.restaurant.cuisineType));
</script>

<template>
  <RouterLink :to="{ name: 'restaurant-detail', params: { id: restaurant.id } }"
              class="card group block overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-raised">
    <!-- A photo when there is one; otherwise a cover in the cuisine's colours. -->
    <div class="relative h-32">
      <img v-if="restaurant.coverImageUrl" :src="restaurant.coverImageUrl" alt=""
           class="h-full w-full object-cover">
      <div v-else :class="`cuisine-cover ${style.cover} flex h-full items-center justify-center`">
        <span class="relative z-10 text-5xl drop-shadow-md transition-transform duration-200 group-hover:scale-110"
              aria-hidden="true">{{ style.icon }}</span>
      </div>

      <!-- Colour AND text: never status by colour alone. -->
      <span v-if="!restaurant.isOrderable"
            class="absolute end-3 top-3 z-10 rounded-full bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-slate-50 backdrop-blur">
        {{ t(UNAVAILABLE_REASON_LABEL[restaurant.unavailableReason] || 'Unavailable') }}
      </span>
    </div>

    <div class="p-4">
      <div class="flex items-start justify-between gap-2">
        <h3 class="font-semibold text-slate-900 group-hover:text-brand-700">{{ restaurant.name }}</h3>
        <span v-if="restaurant.ratingCount > 0"
              class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
          <span aria-hidden="true">&starf;</span>
          {{ Number(restaurant.ratingAverage).toFixed(1) }}
          <span class="font-normal">({{ restaurant.ratingCount }})</span>
        </span>
        <!-- Unrated is stated plainly rather than shown as zero stars. -->
        <span v-else class="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
          {{ t('New restaurant') }}
        </span>
      </div>

      <p class="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {{ t(style.label) }}
      </p>

      <dl class="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
        <div><dt class="inline">{{ t('Delivery') }}</dt> <dd class="inline font-semibold text-slate-800">{{ formatMoney(restaurant.deliveryFee) }}</dd></div>
        <div><dt class="inline">{{ t('Minimum') }}</dt> <dd class="inline font-semibold text-slate-800">{{ formatMoney(restaurant.minimumOrderAmount) }}</dd></div>
        <div><dt class="inline">{{ t('Prep') }}</dt> <dd class="inline font-semibold text-slate-800">{{ t('{n} min', { n: restaurant.avgPreparationMinutes }) }}</dd></div>
      </dl>
    </div>
  </RouterLink>
</template>
