<script setup>
import { onMounted, ref } from 'vue';
import { driverApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';

const ui = useUiStore();
const deliveries = ref([]);
const reviews = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const loading = ref(true);

async function load(page = 1) {
  loading.value = true;
  try {
    const res = await driverApi.deliveries({ scope: 'history', page, limit: 20 });
    deliveries.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
    reviews.value = (await driverApi.reviews().catch(() => ({ data: [] }))).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Delivery history') }}</h1>

    <AppSpinner v-if="loading" label="Loading history" />

    <EmptyState v-else-if="deliveries.length === 0" class="mt-4"
                title="No completed deliveries yet"
                message="Deliveries you finish will be listed here." />

    <template v-else>
      <ul class="mt-4 space-y-2">
        <li v-for="delivery in deliveries" :key="delivery.id" class="card p-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="font-medium text-slate-900">{{ delivery.restaurantName }}</p>
              <p class="text-sm text-slate-600">
                {{ delivery.orderNumber }} &middot; {{ delivery.district || t('Delivered') }} &middot;
                {{ formatDateTime(delivery.deliveredAt || delivery.placedAt) }}
              </p>
            </div>
            <div class="text-end">
              <StatusBadge :status="delivery.status" />
              <p class="mt-1 font-semibold">{{ formatMoney(delivery.totalAmount) }}</p>
            </div>
          </div>
        </li>
      </ul>
      <AppPagination :pagination="pagination" @change="load" />
    </template>

    <section v-if="reviews.length" class="mt-8">
      <h2 class="text-lg font-semibold text-slate-900">{{ t('Ratings you received') }}</h2>
      <ul class="mt-3 space-y-2">
        <li v-for="review in reviews" :key="review.id" class="card p-4 text-sm">
          <p class="font-medium text-slate-800">
            <span aria-hidden="true">&starf;</span> {{ review.rating }}/5
            <span class="ms-2 font-normal text-slate-500">{{ review.customer.displayName }}</span>
          </p>
          <p v-if="review.comment" class="mt-1 text-slate-700">{{ review.comment }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>
