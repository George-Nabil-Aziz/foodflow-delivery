<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { restaurantApi } from '../../services/api.js';
import { usePolling } from '../../composables/usePolling.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime } from '../../utils/datetime.js';
import { restaurantActions, CANCELLATION_REASONS } from '../../utils/orderStatus.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const ui = useUiStore();
const scope = ref('active');
const orders = ref([]);
const initialLoading = ref(true);
const busy = ref(null);

const reasonDialog = ref({ open: false, config: {}, order: null, action: null });
const previousPendingIds = ref(new Set());

async function fetchOrders() {
  const res = await restaurantApi.orders({ scope: scope.value, limit: 50 });
  return res.data;
}

/** Polls the queue; the composable pauses it while the tab is hidden. */
const polling = usePolling(fetchOrders, { immediate: false });

async function load() {
  try {
    const next = await fetchOrders();
    announceNewOrders(next);
    orders.value = next;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    initialLoading.value = false;
  }
}

/** A new PENDING order gets a visible cue; the toast is the audible-equivalent
 *  signal in this build. */
function announceNewOrders(next) {
  const pending = next.filter((o) => o.status === 'PENDING').map((o) => o.id);
  const fresh = pending.filter((id) => !previousPendingIds.value.has(id));
  if (previousPendingIds.value.size > 0 && fresh.length > 0) {
    ui.toastSuccess(t('{count} new order(s) received', { count: fresh.length }));
  }
  previousPendingIds.value = new Set(pending);
}

onMounted(async () => {
  await load();
  polling.start();
});

// Merge polled results into the rendered list.
const rendered = computed(() => polling.data.value ?? orders.value);

const grouped = computed(() => {
  const groups = { PENDING: [], CONFIRMED: [], PREPARING: [], READY_FOR_PICKUP: [], OTHER: [] };
  for (const order of rendered.value) {
    (groups[order.status] ?? groups.OTHER).push(order);
  }
  return groups;
});

function setScope(next) {
  scope.value = next;
  initialLoading.value = true;
  polling.stop();
  load().then(() => polling.start());
}

async function runAction(order, action) {
  const definition = restaurantActions(order.status).find((a) => a.key === action);
  if (definition?.requiresReason) {
    reasonDialog.value = {
      open: true,
      order,
      action,
      config: {
        title: action === 'reject' ? 'Reject this order?' : 'Cancel this order?',
        message: t('This will cancel order {number} and notify the customer. Choose a reason.',
          { number: order.orderNumber }),
        confirmLabel: action === 'reject' ? 'Reject order' : 'Cancel order',
        requireReason: true,
        reasonOptions: CANCELLATION_REASONS,
        variant: 'danger',
      },
    };
    return;
  }
  await perform(order, action, {});
}

async function perform(order, action, body) {
  busy.value = order.id;
  try {
    await restaurantApi.orderAction(order.id, action, body);
    ui.toastSuccess('Order updated');
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
    await load();
  } finally {
    busy.value = null;
  }
}

async function confirmReason({ reason, reasonCode }) {
  const { order, action } = reasonDialog.value;
  reasonDialog.value = { ...reasonDialog.value, open: false };
  // The API takes a reason CODE from a fixed enum; the free text is the note,
  // so a restaurant cannot inject arbitrary text into a status field.
  await perform(order, action, { reason: reasonCode, note: reason });
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Orders') }}</h1>
      <div class="flex gap-2">
        <button v-for="tab in [{ key: 'active', label: 'Active' }, { key: 'history', label: 'History' }]"
                :key="tab.key" type="button"
                class="inline-flex min-h-11 items-center justify-center md:min-h-0 rounded-lg px-3 py-2 text-sm"
                :class="scope === tab.key
                  ? 'bg-primary text-white'
                  : 'border border-slate-300 bg-surface text-slate-700'"
                @click="setScope(tab.key)">
          {{ t(tab.label) }}
        </button>
      </div>
    </div>

    <AppSpinner v-if="initialLoading" label="Loading orders" />

    <EmptyState v-else-if="rendered.length === 0" class="mt-4"
                title="No orders here"
                :message="scope === 'active'
                  ? 'New orders will appear automatically.'
                  : 'Completed and cancelled orders will appear here.'" />

    <div v-else class="mt-4 space-y-6">
      <section v-for="(group, status) in grouped" :key="status">
        <template v-if="group.length">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {{ t(status.replaceAll('_', ' ').toLowerCase()) }} ({{ group.length }})
          </h2>

          <ul class="mt-2 space-y-3">
            <li v-for="order in group" :key="order.id" class="card p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-medium text-slate-900">
                    {{ order.orderNumber }}
                    <span class="ms-2 font-normal text-slate-600">{{ order.customerFirstName }}</span>
                  </p>
                  <p class="text-sm text-slate-600">
                    {{ t('{count} item(s)', { count: order.itemCount }) }} &middot; {{ formatMoney(order.totalAmount) }} &middot;
                    {{ formatDateTime(order.placedAt) }}
                  </p>
                </div>
                <StatusBadge :status="order.status" />
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <!-- Only the transitions legal from this status are offered. -->
                <AppButton v-for="action in restaurantActions(order.status)" :key="action.key"
                           size="sm" :variant="action.variant" :disabled="busy === order.id"
                           @click="runAction(order, action.key)">
                  {{ t(action.label) }}
                </AppButton>

                <RouterLink :to="{ name: 'restaurant-order-detail', params: { id: order.id } }"
                            class="action-link ms-auto text-sm text-brand-700 hover:underline">
                  {{ t('View details') }}
                </RouterLink>
              </div>
            </li>
          </ul>
        </template>
      </section>
    </div>

    <ConfirmDialog :open="reasonDialog.open" :config="reasonDialog.config"
                   @accept="confirmReason" @cancel="reasonDialog.open = false" />

    <p class="sr-only" role="status" aria-live="polite">
      {{ t('{count} orders shown', { count: rendered.length }) }}
    </p>
  </div>
</template>
