<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { orderApi } from '../../services/api.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime } from '../../utils/datetime.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import { t } from '../../i18n/index.js';

const scope = ref('active');
const orders = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const loading = ref(true);
const error = ref(null);

async function load(page = 1) {
  loading.value = true;
  error.value = null;
  try {
    const res = await orderApi.list({ scope: scope.value, page, limit: 10 });
    orders.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

function setScope(next) {
  scope.value = next;
  load(1);
}

onMounted(() => load());
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('My orders') }}</h1>

    <div class="mt-4 flex gap-2" role="tablist" :aria-label="t('Order scope')">
      <button v-for="tab in [{ key: 'active', label: 'Active' }, { key: 'past', label: 'Past' }]"
              :key="tab.key" type="button" role="tab" :aria-selected="scope === tab.key"
              class="inline-flex min-h-11 items-center justify-center md:min-h-0 rounded-lg px-4 py-2 text-sm"
              :class="scope === tab.key
                ? 'bg-primary text-white'
                : 'border border-slate-300 bg-surface text-slate-700'"
              @click="setScope(tab.key)">
        {{ t(tab.label) }}
      </button>
    </div>

    <AppSpinner v-if="loading" label="Loading orders" />
    <ErrorState v-else-if="error" :message="error.message" @retry="() => load(pagination.page)" />

    <EmptyState v-else-if="orders.length === 0" class="mt-4"
                :title="scope === 'active' ? 'No active orders' : 'No past orders yet'"
                message="When you place an order it will appear here.">
      <RouterLink to="/restaurants" class="action-link text-brand-700 hover:underline">{{ t('Browse restaurants') }}</RouterLink>
    </EmptyState>

    <template v-else>
      <ul class="mt-4 space-y-3">
        <li v-for="order in orders" :key="order.id">
          <RouterLink :to="{ name: 'order-detail', params: { id: order.id } }"
                      class="card block p-4 transition hover:shadow-md">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="font-medium text-slate-900">{{ order.restaurant.name }}</p>
                <p class="text-sm text-slate-600">
                  {{ order.orderNumber }} &middot; {{ t('{count} item(s)', { count: order.itemCount }) }} &middot;
                  {{ formatDateTime(order.placedAt) }}
                </p>
              </div>
              <div class="text-end">
                <StatusBadge :status="order.status" />
                <p class="mt-1 font-semibold">{{ formatMoney(order.totalAmount) }}</p>
              </div>
            </div>
            <p v-if="order.canReview" class="mt-2 text-sm font-medium text-brand-700">
              {{ t('Rate this order') }}
            </p>
          </RouterLink>
        </li>
      </ul>
      <AppPagination :pagination="pagination" @change="load" />
    </template>
  </div>
</template>
