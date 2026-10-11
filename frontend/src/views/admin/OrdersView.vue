<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime } from '../../utils/datetime.js';
import { CANCELLATION_REASONS } from '../../utils/orderStatus.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const route = useRoute();
const ui = useUiStore();

const view = ref(route.query.view ?? 'all');
const orders = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const loading = ref(true);
const busy = ref(null);
const statusFilter = ref('');
const dialog = ref({ open: false, config: {}, order: null });

const TERMINAL = ['DELIVERED', 'CANCELLED'];

/** An enum as it has always read ("ready for pickup"), translated in Arabic. */
const enumText = (value) => t(value.replaceAll('_', ' ').toLowerCase());

async function load(page = 1) {
  loading.value = true;
  try {
    if (view.value === 'unassigned') {
      orders.value = (await adminApi.unassigned()).data;
      pagination.value = { page: 1, totalPages: 1, total: orders.value.length };
    } else if (view.value === 'stuck') {
      orders.value = (await adminApi.stuck()).data;
      pagination.value = { page: 1, totalPages: 1, total: orders.value.length };
    } else {
      const params = { page, limit: 20 };
      if (statusFilter.value) params.status = statusFilter.value;
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

/** Force-cancel names the specific consequence, including the driver release. */
function askCancel(order) {
  dialog.value = {
    open: true,
    order,
    config: {
      title: 'Force-cancel this order?',
      message: t('This will cancel order {orderNumber}, release any assigned driver, and notify the customer. It cannot be undone.', { orderNumber: order.orderNumber }),
      confirmLabel: 'Force-cancel order',
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
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Orders') }}</h1>

    <div class="mt-4 flex flex-wrap gap-2">
      <button v-for="tab in [
                { key: 'all', label: 'All orders' },
                { key: 'unassigned', label: 'Waiting for a driver' },
                { key: 'stuck', label: 'Stuck' },
              ]" :key="tab.key" type="button"
              class="inline-flex min-h-11 items-center justify-center md:min-h-0 rounded-lg px-3 py-2 text-sm"
              :class="view === tab.key
                ? 'bg-primary text-white'
                : 'border border-slate-300 bg-surface text-slate-700'"
              @click="setView(tab.key)">
        {{ t(tab.label) }}
      </button>

      <select v-if="view === 'all'" v-model="statusFilter" class="field-input ms-auto w-48"
              :aria-label="t('Filter by status')" @change="load(1)">
        <option value="">{{ t('All statuses') }}</option>
        <option v-for="s in ['PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED']"
                :key="s" :value="s">
          {{ enumText(s) }}
        </option>
      </select>
    </div>

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
                <span class="font-medium text-slate-900">{{ order.orderNumber }}</span>
                <span v-if="order.stuckReason" class="block text-xs text-amber-800">
                  {{ enumText(order.stuckReason) }}
                </span>
              </td>
              <td :data-label="t('Restaurant')" class="p-3 text-slate-700">{{ order.restaurant?.name || order.restaurantName }}</td>
              <td :data-label="t('Status')" class="p-3">
                <StatusBadge :status="order.status" />
                <span v-if="order.dispatchState === 'UNASSIGNED'" class="mt-1 block text-xs text-slate-500">
                  {{ t('no driver yet') }}
                </span>
              </td>
              <td :data-label="t('Total')" class="p-3">{{ formatMoney(order.totalAmount) }}</td>
              <td :data-label="t('Placed')" class="p-3 text-slate-600">{{ formatDateTime(order.placedAt) }}</td>
              <td :data-label="t('Actions')" class="p-3">
                <button v-if="!TERMINAL.includes(order.status)" type="button" :disabled="busy === order.id"
                        class="action-link text-red-700 hover:underline" @click="askCancel(order)">
                  {{ t('Force-cancel') }}
                </button>
                <span v-else class="text-slate-500">&mdash;</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination v-if="view === 'all'" :pagination="pagination" @change="load" />
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmCancel" @cancel="dialog.open = false" />
  </div>
</template>
