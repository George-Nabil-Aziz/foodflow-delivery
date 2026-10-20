<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';
import { capitalize, enumText } from '../../utils/labels.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';

const auth = useAuthStore();
const ui = useUiStore();
const stats = ref(null);
const stuck = ref([]);
const loading = ref(true);

/** How many things are waiting on an admin, summed across the attention page's items. */
const attentionCount = computed(() => (stats.value
  ? stats.value.accounts.pendingRestaurants + stats.value.accounts.pendingDrivers
    + stats.value.unassignedBacklog + stuck.value.length
  : 0));


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
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Welcome, {name}', { name: auth.user?.fullName ?? '' }) }}</h1>
      <!-- Everything waiting on an admin lives on its own page; the count says whether to go. -->
      <RouterLink v-if="stats" :to="{ name: 'admin-attention' }"
                  class="ui-control inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition md:min-h-0"
                  :class="attentionCount
                    ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400'
                    : 'border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50'">
        {{ t('Needs attention') }}
        <span class="rounded-full px-2 py-0.5 text-xs font-semibold"
              :class="attentionCount ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'">
          {{ attentionCount }}
        </span>
      </RouterLink>
    </div>

    <AppSpinner v-if="loading" label="Loading statistics" />

    <template v-else-if="stats">
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
          <!-- Laid out like the status rows above: label at the start, value at the end. -->
          <p class="mt-3 flex justify-between gap-2 border-t border-slate-200 pt-3 text-sm">
            <span class="text-slate-600">{{ t('Average delivery time') }}</span>
            <span class="font-medium">
              <template v-if="stats.averageDeliveryMinutes">{{ stats.averageDeliveryMinutes }} {{ t('minutes') }}</template>
              <template v-else>{{ capitalize(t('not enough data')) }}</template>
            </span>
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
