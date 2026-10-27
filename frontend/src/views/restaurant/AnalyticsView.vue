<script setup>
import { computed, onMounted, ref } from 'vue';
import { restaurantApi } from '../../services/api.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ErrorState from '../../components/shared/ErrorState.vue';

/**
 * The owner's trading summary for one period (spec-17). Every figure comes
 * from the server; the page only lays it out and scales the bars.
 */
const PERIODS = [7, 30, 90];

const days = ref(30);
const data = ref(null);
const loading = ref(true);
const error = ref(null);

// A slow answer for an earlier period must not overwrite a later choice.
let latest = 0;
async function load() {
  const ticket = (latest += 1);
  loading.value = true;
  error.value = null;
  try {
    const res = (await restaurantApi.analytics(days.value)).data;
    if (ticket === latest) data.value = res;
  } catch (err) {
    if (ticket === latest) error.value = err;
  } finally {
    if (ticket === latest) loading.value = false;
  }
}
onMounted(load);

function choose(value) {
  if (value === days.value) return;
  days.value = value;
  load();
}

const maxHour = computed(() => Math.max(1, ...(data.value?.ordersByHour ?? []).map((h) => h.orders)));
const maxItem = computed(() => Math.max(1, ...(data.value?.topItems ?? []).map((i) => i.quantity)));
const pct = (value, max) => `${Math.round((value / max) * 100)}%`;
const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Analytics') }}</h1>

      <div role="group" :aria-label="t('Period')" class="inline-flex rounded-lg border border-slate-300 bg-surface p-0.5">
        <button v-for="p in PERIODS" :key="p" type="button"
                class="ui-control rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                :class="p === days ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-100'"
                :aria-pressed="p === days" @click="choose(p)">
          {{ t('Last {n} days', { n: p }) }}
        </button>
      </div>
    </div>

    <AppSpinner v-if="loading && !data" label="Loading analytics" />
    <ErrorState v-else-if="error" :message="error.message" @retry="load" />

    <template v-else-if="data">
      <!-- Delivered orders only: a cancelled order is not revenue. -->
      <dl class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" :class="{ 'opacity-60': loading }" :aria-busy="loading">
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Delivered orders') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">{{ data.deliveredOrders }}</dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Revenue') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">{{ formatMoney(data.revenue) }}</dd>
          <p class="mt-1 text-xs text-slate-600">{{ t('Food sold after discounts. Excludes delivery fee and tax.') }}</p>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Average order value') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">
            <template v-if="data.averageOrderValue !== null">{{ formatMoney(data.averageOrderValue) }}</template>
            <template v-else>&ndash;</template>
          </dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Cancellation rate') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">
            <template v-if="data.cancellationRate !== null">{{ data.cancellationRate }}%</template>
            <template v-else>&ndash;</template>
          </dd>
          <p class="mt-1 text-xs text-slate-600">{{ t('{n} cancelled', { n: data.cancelledOrders }) }}</p>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Average preparation time') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">
            <template v-if="data.averagePreparationMinutes !== null">{{ t('{n} min', { n: data.averagePreparationMinutes }) }}</template>
            <template v-else>&ndash;</template>
          </dd>
          <p class="mt-1 text-xs text-slate-600">{{ t('From accepted to ready.') }}</p>
        </div>
      </dl>

      <EmptyState v-if="data.deliveredOrders === 0" class="mt-6"
                  title="No delivered orders in this period"
                  message="Charts appear once orders have been delivered." />

      <div v-else class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="card p-4" aria-labelledby="top-items">
          <h2 id="top-items" class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ t('Top items') }}</h2>
          <ol class="mt-4 space-y-3">
            <li v-for="item in data.topItems" :key="item.name">
              <div class="flex items-baseline justify-between gap-2 text-sm">
                <span class="min-w-0 truncate font-medium text-slate-800">{{ item.name }}</span>
                <span class="shrink-0 text-slate-600">{{ t('{n} sold', { n: item.quantity }) }}</span>
              </div>
              <div class="mt-1 h-2.5 rounded-full bg-slate-100" aria-hidden="true">
                <div class="h-full rounded-full bg-brand-600" :style="{ width: pct(item.quantity, maxItem) }" />
              </div>
            </li>
          </ol>
        </section>

        <section class="card p-4" aria-labelledby="by-hour">
          <h2 id="by-hour" class="text-sm font-semibold uppercase tracking-wide text-slate-500">{{ t('Orders by hour of day') }}</h2>
          <p class="mt-1 text-xs text-slate-600">{{ t('Local time ({zone}), by when the order was placed.', { zone: data.timezone }) }}</p>

          <!-- LTR even in Arabic: time runs left to right on a chart. -->
          <div dir="ltr" class="mt-4">
            <div class="flex h-40 items-end gap-0.5" role="img"
                 :aria-label="t('Orders by hour of day')">
              <div v-for="h in data.ordersByHour" :key="h.hour" class="flex h-full flex-1 items-end"
                   :title="`${hourLabel(h.hour)}: ${h.orders}`">
                <div class="w-full rounded-t"
                     :style="{ height: h.orders ? pct(h.orders, maxHour) : '2px' }"
                     :class="h.orders ? 'bg-brand-600' : 'bg-slate-200'" />
              </div>
            </div>
            <div class="mt-1 flex gap-0.5 text-[10px] text-slate-500" aria-hidden="true">
              <span v-for="h in data.ordersByHour" :key="h.hour" class="flex-1 text-center">
                {{ h.hour % 3 === 0 ? h.hour : '' }}
              </span>
            </div>
          </div>
          <ul class="sr-only">
            <li v-for="h in data.ordersByHour" :key="h.hour">{{ hourLabel(h.hour) }}: {{ h.orders }}</li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
