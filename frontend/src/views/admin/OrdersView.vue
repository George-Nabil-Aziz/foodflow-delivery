<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime } from '../../utils/datetime.js';
import { CANCELLATION_REASONS } from '../../utils/orderStatus.js';
import { t } from '../../i18n/index.js';
import { capitalize, enumText } from '../../utils/labels.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import FilterBar from '../../components/shared/FilterBar.vue';
import PageTitle from '../../components/shared/PageTitle.vue';
import FilterSearch from '../../components/shared/FilterSearch.vue';
import FilterSelect from '../../components/shared/FilterSelect.vue';
import { countEach } from '../../utils/countEach.js';
import OrderDetailsDialog from '../../components/admin/OrderDetailsDialog.vue';

const route = useRoute();
const ui = useUiStore();

const view = ref(route.query.view ?? 'all');
const search = ref('');
const orders = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const pageSize = ref(20);
const loading = ref(true);
const busy = ref(null);
const dialog = ref({ open: false, config: {}, order: null });

const TERMINAL = ['DELIVERED', 'CANCELLED'];
const STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

const paged = computed(() => view.value !== 'unassigned' && view.value !== 'stuck');

const counts = ref({});

const statusOptions = computed(() => [
  { value: 'all', label: t('All orders') },
  ...STATUSES.map((s) => ({ value: s, label: enumText(s) })),
  { heading: t('Queues') },
  { value: 'unassigned', label: t('Waiting for a driver') },
  { value: 'stuck', label: t('Stuck') },
].map((o) => ('heading' in o ? o : { ...o, count: counts.value[o.value] })));

/** The size of every choice: statuses follow the search, the two queues are unsearched. */
async function loadCounts() {
  const q = search.value.trim().length >= 1 ? search.value.trim() : undefined;
  counts.value = await countEach(['all', ...STATUSES, 'unassigned', 'stuck'], (value) => {
    if (value === 'unassigned') return adminApi.unassigned();
    if (value === 'stuck') return adminApi.stuck();
    return adminApi.orders({ page: 1, limit: 1, ...(value !== 'all' && { status: value }), ...(q && { q }) });
  });
}

async function load(page = 1) {
  loading.value = true;
  loadCounts();
  try {
    if (view.value === 'unassigned') {
      orders.value = (await adminApi.unassigned()).data;
      pagination.value = { page: 1, totalPages: 1, total: orders.value.length };
    } else if (view.value === 'stuck') {
      orders.value = (await adminApi.stuck()).data;
      pagination.value = { page: 1, totalPages: 1, total: orders.value.length };
    } else {
      const params = { page, limit: pageSize.value };
      if (view.value !== 'all') params.status = view.value;
      if (search.value.trim().length >= 1) params.q = search.value.trim();
      const res = await adminApi.orders(params);
      orders.value = res.data;
      pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
    }
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());

function setView(next) {
  view.value = next;
  load(1);
}

const details = ref({ open: false, id: null, orderNumber: '' });

/** Cancelling names the specific consequence, including the driver release. */
function askCancel(order) {
  dialog.value = {
    open: true,
    order,
    config: {
      title: 'Cancel this order?',
      message: t('This will cancel order {orderNumber}, release any assigned driver, and notify the customer. It cannot be undone.', { orderNumber: order.orderNumber }),
      confirmLabel: 'Cancel order',
      requireReason: true,
      reasonOptions: CANCELLATION_REASONS,
      variant: 'danger',
    },
  };
}

async function confirmCancel({ reason, reasonCode }) {
  const order = dialog.value.order;
  dialog.value = { ...dialog.value, open: false };
  busy.value = order.id;
  try {
    await adminApi.forceCancel(order.id, { reason: reasonCode, note: reason });
    ui.toastSuccess('Order cancelled');
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <PageTitle :title="t('Orders')" :count="loading ? null : pagination.total" />

    <!-- One filter for every view: the statuses, then the two dispatch queues. -->
    <FilterBar :add-to="{ name: 'admin-order-new' }" :add-label="t('Make an order')">
      <!-- The two dispatch queues are short live lists with no search. -->
      <FilterSearch v-if="paged" id="o-search" v-model="search" :placeholder="t('Search by order, restaurant or customer')" @update:model-value="load(1)" />
      <FilterSelect id="o-status" :model-value="view" :label="t('Status')" :options="statusOptions"
                    @update:model-value="setView" />
    </FilterBar>

    <AppSpinner v-if="loading" label="Loading orders" />

    <EmptyState v-else-if="orders.length === 0" class="mt-4"
                :title="view === 'stuck' ? 'Nothing is stuck' : 'No orders match this view'"
                :message="view === 'unassigned'
                  ? 'Every confirmed order has a driver or an active offer.'
                  : undefined" />

    <template v-else>
      <div class="card table-wrap mt-4 overflow-x-auto">
        <table class="table-cards w-full text-start text-sm">
          <thead class="border-b border-slate-200 text-slate-600">
            <tr>
              <th scope="col" class="p-3">{{ t('Order') }}</th>
              <th scope="col" class="p-3">{{ t('Restaurant') }}</th>
              <th scope="col" class="p-3">{{ t('Status') }}</th>
              <th scope="col" class="p-3">{{ t('Total') }}</th>
              <th scope="col" class="p-3">{{ t('Placed') }}</th>
              <th scope="col" class="p-3">{{ t('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in orders" :key="order.id" class="border-b border-slate-100 last:border-0">
              <td :data-label="t('Order')" class="p-3">
                <button type="button" class="details-link" @click="details = { open: true, id: order.id, orderNumber: order.orderNumber }">{{ order.orderNumber }}</button>
                <span v-if="order.stuckReason" class="block text-xs text-amber-800">
                  {{ enumText(order.stuckReason) }}
                </span>
              </td>
              <td :data-label="t('Restaurant')" class="p-3 text-slate-700">{{ order.restaurant?.name || order.restaurantName }}</td>
              <td :data-label="t('Status')" class="p-3">
                <StatusBadge :status="order.status" />
                <span v-if="order.dispatchState === 'UNASSIGNED'" class="mt-1 block text-xs text-slate-500">
                  {{ capitalize(t('no driver yet')) }}
                </span>
              </td>
              <td :data-label="t('Total')" class="p-3">{{ formatMoney(order.totalAmount) }}</td>
              <td :data-label="t('Placed')" class="p-3 text-slate-600">{{ formatDateTime(order.placedAt) }}</td>
              <td :data-label="t('Actions')" class="p-3">
                <button v-if="!TERMINAL.includes(order.status)" type="button" :disabled="busy === order.id"
                        class="action-link text-red-700 hover:underline" @click="askCancel(order)">
                  {{ t('Cancel') }}
                </button>
                <span v-else class="text-slate-500">&mdash;</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination v-if="paged" :pagination="pagination" :limit="pageSize" @change="load"
          @update:limit="(n) => { pageSize = n; load(1); }" />
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmCancel" @cancel="dialog.open = false" />
    <OrderDetailsDialog :open="details.open" :order-id="details.id" :order-number="details.orderNumber"
                        @close="details.open = false" />
  </div>
</template>
