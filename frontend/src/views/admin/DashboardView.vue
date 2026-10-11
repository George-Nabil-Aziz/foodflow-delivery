<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';

const ui = useUiStore();
const stats = ref(null);
const stuck = ref([]);
const loading = ref(true);

/** An enum as it has always read ("out for delivery"), translated in Arabic. */
const enumText = (value) => t(value.replaceAll('_', ' ').toLowerCase());

onMounted(async () => {
  try {
    stats.value = (await adminApi.stats()).data;
    stuck.value = (await adminApi.stuck().catch(() => ({ data: [] }))).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Platform dashboard') }}</h1>

    <AppSpinner v-if="loading" label="Loading statistics" />

    <template v-else-if="stats">
      <!-- Anything needing action links straight to it. -->
      <div v-if="stats.accounts.pendingRestaurants || stats.accounts.pendingDrivers || stats.unassignedBacklog || stuck.length"
           class="card mt-4 border-amber-300 bg-amber-50 p-4" role="status">
        <h2 class="font-semibold text-amber-900">{{ t('Needs attention') }}</h2>
        <ul class="mt-2 space-y-1 text-sm text-amber-900">
          <li v-if="stats.accounts.pendingRestaurants">
            <RouterLink :to="{ name: 'admin-restaurants', query: { status: 'PENDING_APPROVAL' } }" class="action-link underline">
              {{ t('{count} restaurant(s) awaiting approval', { count: stats.accounts.pendingRestaurants }) }}
            </RouterLink>
          </li>
          <li v-if="stats.accounts.pendingDrivers">
            <RouterLink :to="{ name: 'admin-drivers', query: { status: 'PENDING_APPROVAL' } }" class="action-link underline">
              {{ t('{count} driver(s) awaiting approval', { count: stats.accounts.pendingDrivers }) }}
            </RouterLink>
          </li>
          <li v-if="stats.unassignedBacklog">
            <RouterLink :to="{ name: 'admin-orders', query: { view: 'unassigned' } }" class="action-link underline">
              {{ t('{count} order(s) waiting for a driver', { count: stats.unassignedBacklog }) }}
            </RouterLink>
          </li>
          <li v-if="stuck.length">
            <RouterLink :to="{ name: 'admin-orders', query: { view: 'stuck' } }" class="action-link underline">
              {{ t('{count} stuck order(s)', { count: stuck.length }) }}
            </RouterLink>
          </li>
        </ul>
      </div>

      <dl class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Orders today') }}</dt>
          <dd class="mt-1 text-2xl font-semibold">{{ stats.orders.today }}</dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('GMV today') }}</dt>
          <!-- The caption lives inside the dd: a dl may only contain dt/dd
               pairs (optionally wrapped in a div), never a loose p. -->
          <dd class="mt-1 text-2xl font-semibold">
            {{ formatMoney(stats.gmv.today) }}
            <span class="mt-1 block text-xs font-normal text-slate-500">{{ t('Delivered orders only') }}</span>
          </dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Active restaurants') }}</dt>
          <dd class="mt-1 text-2xl font-semibold">{{ stats.accounts.activeRestaurants }}</dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Drivers on delivery') }}</dt>
          <dd class="mt-1 text-2xl font-semibold">
            {{ stats.accounts.driversOnDelivery }}
            <span class="text-base font-normal text-slate-500">/ {{ stats.accounts.activeDrivers }}</span>
          </dd>
        </div>
      </dl>

      <section class="mt-6 grid gap-4 lg:grid-cols-2">
        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Orders by status') }}</h2>
          <ul class="mt-3 space-y-1 text-sm">
            <li v-for="(count, status) in stats.orders.byStatus" :key="status"
                class="flex justify-between">
              <span class="text-slate-600">{{ enumText(status) }}</span>
              <span class="font-medium">{{ count }}</span>
            </li>
          </ul>
          <p class="mt-3 text-sm text-slate-600">
            {{ t('Average delivery time:') }}
            <strong>{{ stats.averageDeliveryMinutes ?? t('not enough data') }}</strong>
            <template v-if="stats.averageDeliveryMinutes"> {{ t('minutes') }}</template>
          </p>
        </div>

        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Top restaurants (30 days)') }}</h2>
          <ul v-if="stats.topRestaurants.length" class="mt-3 space-y-1 text-sm">
            <li v-for="r in stats.topRestaurants" :key="r.id" class="flex justify-between gap-2">
              <span class="text-slate-700">{{ r.name }}</span>
              <span class="font-medium">{{ formatMoney(r.gmv) }} ({{ r.orders }})</span>
            </li>
          </ul>
          <p v-else class="mt-3 text-sm text-slate-600">{{ t('No delivered orders in the last 30 days.') }}</p>
        </div>
      </section>
    </template>
  </div>
</template>
