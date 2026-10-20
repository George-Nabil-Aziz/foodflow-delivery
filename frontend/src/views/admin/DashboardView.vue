<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime, formatTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import { capitalize, enumText, rawEnumText } from '../../utils/labels.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';
import OrderDetailsDialog from '../../components/admin/OrderDetailsDialog.vue';

const REFRESH_MS = 30000;

const auth = useAuthStore();
const ui = useUiStore();
const stats = ref(null);
const stuck = ref([]);
const loading = ref(true);
const updatedAt = ref(null);
const orderDetails = ref({ open: false, id: null, orderNumber: '' });

/** How many things are waiting on an admin, summed across the attention page's items. */
const attentionCount = computed(() => (stats.value
  ? stats.value.accounts.pendingRestaurants + stats.value.accounts.pendingDrivers
    + stats.value.unassignedBacklog + stuck.value.length
  : 0));

const rating = (avg, count) => (count ? `${Number(avg).toFixed(2)} (${count})` : capitalize(t('unrated')));

// Today at a glance: the live operation first, then the day's outcomes.
const todayTiles = computed(() => {
  const s = stats.value;
  return [
    { label: 'Orders today', value: s.orders.today },
    { label: 'GMV today', value: formatMoney(s.gmv.today), note: 'Delivered orders only' },
    { label: 'In progress now', value: s.today.inProgress },
    { label: 'Drivers on delivery', value: s.accounts.driversOnDelivery, of: s.accounts.activeDrivers },
    { label: 'Delivered today', value: s.today.delivered },
    { label: 'Cancelled today', value: s.today.cancelled },
    { label: 'New customers today', value: s.today.newCustomers },
    { label: 'Reviews today', value: s.today.reviews },
  ];
});

const platformRows = computed(() => {
  const s = stats.value;
  return [
    { label: 'Customers', value: s.accounts.customers },
    { label: 'Active restaurants', value: s.accounts.activeRestaurants },
    { label: 'Active drivers', value: s.accounts.activeDrivers },
    { label: 'GMV (30 days)', value: formatMoney(s.gmv.last30Days) },
    { label: 'Average rating (30 days)', value: s.averageRating30d ?? capitalize(t('not enough data')) },
    { label: 'Average delivery time', value: s.averageDeliveryMinutes
      ? `${s.averageDeliveryMinutes} ${t('minutes')}` : capitalize(t('not enough data')) },
  ];
});

const isToday = (value) => new Date(value).toDateString() === new Date().toDateString();
const when = (value) => (isToday(value) ? formatTime(value) : formatDateTime(value));

async function load() {
  try {
    const [s, st] = await Promise.all([adminApi.stats(), adminApi.stuck().catch(() => ({ data: [] }))]);
    stats.value = s.data;
    stuck.value = st.data;
    updatedAt.value = new Date();
  } catch (err) {
    // A failed background refresh keeps the last numbers rather than toasting every 30s.
    if (!stats.value) ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

let timer = null;
onMounted(() => {
  load();
  timer = setInterval(load, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));
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
      <!-- Today, live: refreshed every 30 seconds while the page is open. -->
      <dl class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="tile in todayTiles" :key="tile.label" class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t(tile.label) }}</dt>
          <dd class="mt-1 text-2xl font-semibold">
            {{ tile.value }}
            <span v-if="tile.of != null" class="text-base font-normal text-slate-500">/ {{ tile.of }}</span>
            <span v-if="tile.note" class="mt-1 block text-xs font-normal text-slate-500">{{ t(tile.note) }}</span>
          </dd>
        </div>
      </dl>

      <section class="card mt-6 p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="font-semibold text-slate-900">{{ t('Live activity') }}</h2>
          <span class="text-xs text-slate-500">
            <span class="me-1 inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            {{ t('Updated {time}', { time: formatTime(updatedAt) }) }}
          </span>
        </div>
        <ul v-if="stats.activity.length" class="mt-3 max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm">
          <li v-for="a in stats.activity" :key="a.kind + a.refId + a.at" class="flex items-start justify-between gap-3 py-2">
            <div class="min-w-0">
              <template v-if="a.kind === 'ORDER'">
                <p class="flex flex-wrap items-center gap-2">
                  <button type="button" class="details-link" @click="orderDetails = { open: true, id: a.refId, orderNumber: a.ref }">{{ a.ref }}</button>
                  <span class="text-slate-600">{{ a.subject }}</span>
                  <StatusBadge :status="a.detail" />
                </p>
              </template>
              <template v-else-if="a.kind === 'SIGNUP'">
                <p class="text-slate-700">
                  {{ t('New account') }}: <span class="font-medium text-slate-900">{{ a.ref }}</span>
                  <span class="text-slate-500"> · {{ rawEnumText(a.detail) }}</span>
                </p>
              </template>
              <template v-else>
                <p class="text-slate-700">
                  {{ t('{name} reviewed {restaurant}', { name: a.ref, restaurant: a.subject }) }}
                  <span class="font-medium"><span class="text-amber-500" aria-hidden="true">★</span> {{ a.rating }}</span>
                </p>
                <p v-if="a.detail" class="truncate text-xs text-slate-500">{{ a.detail }}</p>
              </template>
            </div>
            <span class="shrink-0 text-xs text-slate-500">{{ when(a.at) }}</span>
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-slate-600">{{ t('Nothing has happened yet.') }}</p>
      </section>

      <section class="mt-6 grid gap-4 lg:grid-cols-2">
        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Orders by status') }}</h2>
          <ul class="mt-3 space-y-1 text-sm">
            <li v-for="(count, status) in stats.orders.byStatus" :key="status" class="flex justify-between">
              <span class="text-slate-600">{{ enumText(status) }}</span>
              <span class="font-medium">{{ count }}</span>
            </li>
          </ul>
        </div>

        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Platform') }}</h2>
          <ul class="mt-3 space-y-1 text-sm">
            <li v-for="row in platformRows" :key="row.label" class="flex justify-between gap-2">
              <span class="text-slate-600">{{ t(row.label) }}</span>
              <span class="font-medium">{{ row.value }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- The 30-day leaderboards, last: useful context, never urgent. -->
      <section class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Top restaurants (30 days)') }}</h2>
          <ol v-if="stats.topRestaurants.length" class="mt-3 space-y-1 text-sm">
            <li v-for="r in stats.topRestaurants" :key="r.id" class="flex justify-between gap-2">
              <span class="text-slate-700">{{ r.name }}</span>
              <span class="font-medium">{{ formatMoney(r.gmv) }} ({{ r.orders }})</span>
            </li>
          </ol>
          <p v-else class="mt-3 text-sm text-slate-600">{{ t('No delivered orders in the last 30 days.') }}</p>
        </div>

        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Top drivers (30 days)') }}</h2>
          <ol v-if="stats.topDrivers.length" class="mt-3 space-y-1 text-sm">
            <li v-for="d in stats.topDrivers" :key="d.id" class="flex justify-between gap-2">
              <span class="text-slate-700">{{ d.name }}</span>
              <span class="text-end">
                <span class="font-medium">{{ t('{count} deliveries', { count: d.deliveries }) }}</span>
                <span class="block text-xs text-slate-500"><span class="text-amber-500" aria-hidden="true">★</span> {{ rating(d.ratingAverage, d.ratingCount) }}</span>
              </span>
            </li>
          </ol>
          <p v-else class="mt-3 text-sm text-slate-600">{{ t('No delivered orders in the last 30 days.') }}</p>
        </div>

        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Top customers (30 days)') }}</h2>
          <ol v-if="stats.topCustomers.length" class="mt-3 space-y-1 text-sm">
            <li v-for="c in stats.topCustomers" :key="c.id" class="flex justify-between gap-2">
              <span class="text-slate-700">{{ c.name }}</span>
              <span class="font-medium">{{ formatMoney(c.spent) }} ({{ c.orders }})</span>
            </li>
          </ol>
          <p v-else class="mt-3 text-sm text-slate-600">{{ t('No delivered orders in the last 30 days.') }}</p>
        </div>

        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Top rated restaurants') }}</h2>
          <ol v-if="stats.topRated.length" class="mt-3 space-y-1 text-sm">
            <li v-for="r in stats.topRated" :key="r.id" class="flex justify-between gap-2">
              <span class="text-slate-700">{{ r.name }}</span>
              <span class="font-medium"><span class="text-amber-500" aria-hidden="true">★</span> {{ rating(r.ratingAverage, r.ratingCount) }}</span>
            </li>
          </ol>
          <p v-else class="mt-3 text-sm text-slate-600">{{ t('Not enough reviews yet.') }}</p>
        </div>

        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Top items (30 days)') }}</h2>
          <ol v-if="stats.topItems.length" class="mt-3 space-y-1 text-sm">
            <li v-for="i in stats.topItems" :key="i.name + i.restaurant" class="flex justify-between gap-2">
              <span class="min-w-0 text-slate-700">
                {{ i.name }}
                <span class="block text-xs text-slate-500">{{ i.restaurant }}</span>
              </span>
              <span class="font-medium">× {{ i.quantity }}</span>
            </li>
          </ol>
          <p v-else class="mt-3 text-sm text-slate-600">{{ t('No delivered orders in the last 30 days.') }}</p>
        </div>
      </section>
    </template>

    <OrderDetailsDialog :open="orderDetails.open" :order-id="orderDetails.id" :order-number="orderDetails.orderNumber"
                        @close="orderDetails.open = false" />
  </div>
</template>
