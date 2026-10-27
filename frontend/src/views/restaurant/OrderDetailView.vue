<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { restaurantApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime } from '../../utils/datetime.js';
import { restaurantActions, CANCELLATION_REASONS } from '../../utils/orderStatus.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import LineOptions from '../../components/shared/LineOptions.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const route = useRoute();
const ui = useUiStore();

const order = ref(null);
const loading = ref(true);
const error = ref(null);
const busy = ref(false);
const dialog = ref({ open: false, config: {}, action: null });

async function load() {
  loading.value = true;
  error.value = null;
  try {
    order.value = (await restaurantApi.order(route.params.id)).data;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function runAction(action) {
  const definition = restaurantActions(order.value.status).find((a) => a.key === action.key);
  if (definition?.requiresReason) {
    dialog.value = {
      open: true,
      action: action.key,
      config: {
        title: action.key === 'reject' ? 'Reject this order?' : 'Cancel this order?',
        message: t('This will cancel order {number} and tell the customer why.',
          { number: order.value.orderNumber }),
        confirmLabel: action.label,
        requireReason: true,
        reasonOptions: CANCELLATION_REASONS,
        variant: 'danger',
      },
    };
    return;
  }
  perform(action.key, {});
}

async function perform(action, body) {
  busy.value = true;
  try {
    order.value = (await restaurantApi.orderAction(route.params.id, action, body)).data;
    ui.toastSuccess('Order updated');
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
    await load();
  } finally {
    busy.value = false;
  }
}

async function confirmReason({ reason, reasonCode }) {
  const action = dialog.value.action;
  dialog.value = { ...dialog.value, open: false };
  await perform(action, { reason: reasonCode, note: reason });
}
</script>

<template>
  <div>
    <AppSpinner v-if="loading" label="Loading order" />
    <ErrorState v-else-if="error" :message="error.message" @retry="load" />

    <template v-else-if="order">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-slate-900">{{ t('Order {number}', { number: order.orderNumber }) }}</h1>
          <p class="mt-1 text-sm text-slate-600">{{ t('Placed {date}', { date: formatDateTime(order.placedAt) }) }}</p>
        </div>
        <StatusBadge :status="order.status" />
      </div>

      <div class="mt-5 grid gap-6 lg:grid-cols-3">
        <section class="space-y-4 lg:col-span-2">
          <div class="card p-4">
            <h2 class="font-semibold text-slate-900">{{ t('Items to prepare') }}</h2>
            <ul class="mt-3 space-y-2">
              <li v-for="item in order.items" :key="item.id" class="flex justify-between gap-3 text-sm">
                <span class="text-slate-800">
                  <strong>{{ item.quantity }} &times;</strong> {{ item.name }}
                  <LineOptions :options="item.options" :notes="item.notes" />
                </span>
                <span>{{ formatMoney(item.lineTotal) }}</span>
              </li>
            </ul>
          </div>

          <div class="card p-4">
            <h2 class="font-semibold text-slate-900">{{ t('What you can do now') }}</h2>
            <div class="mt-3 flex flex-wrap gap-2">
              <!-- Only legal transitions are offered; the server re-checks. -->
              <AppButton v-for="action in restaurantActions(order.status)" :key="action.key"
                         :variant="action.variant" :disabled="busy" @click="runAction(action)">
                {{ t(action.label) }}
              </AppButton>
              <p v-if="restaurantActions(order.status).length === 0" class="text-sm text-slate-600">
                {{ t('No actions are available for an order in this state.') }}
              </p>
            </div>
          </div>

          <div class="card p-4">
            <h2 class="font-semibold text-slate-900">{{ t('History') }}</h2>
            <ol class="mt-3 space-y-2 text-sm">
              <li v-for="(event, index) in order.timeline" :key="index" class="flex justify-between gap-3">
                <span class="text-slate-800">
                  {{ t(event.status.replaceAll('_', ' ').toLowerCase()) }}
                  <span class="text-slate-500">{{ t('by {actor}', { actor: t(event.actor.toLowerCase()) }) }}</span>
                  <span v-if="event.reason" class="block text-slate-600">
                    {{ t(event.reason.replaceAll('_', ' ').toLowerCase()) }}
                    <template v-if="event.note">&mdash; {{ event.note }}</template>
                  </span>
                </span>
                <span class="shrink-0 text-slate-500">{{ formatDateTime(event.at) }}</span>
              </li>
            </ol>
          </div>
        </section>

        <aside class="space-y-4">
          <div class="card p-4 text-sm">
            <h2 class="font-semibold text-slate-900">{{ t('Customer') }}</h2>
            <!-- First name and masked phone only: never their email. -->
            <p class="mt-2 text-slate-700">{{ order.customer.firstName }}</p>
            <p class="text-slate-700">{{ order.customer.phone }}</p>
            <address class="mt-3 not-italic text-slate-700">
              {{ order.deliveryAddress.line1 }}<br>
              <template v-if="order.deliveryAddress.district">{{ order.deliveryAddress.district }}, </template>
              {{ order.deliveryAddress.city }}
            </address>
            <p v-if="order.customerNote" class="mt-2 rounded bg-amber-50 p-2 text-amber-900">
              {{ order.customerNote }}
            </p>
          </div>

          <div class="card p-4 text-sm">
            <h2 class="font-semibold text-slate-900">{{ t('Total') }}</h2>
            <dl class="mt-2 space-y-1">
              <div class="flex justify-between"><dt class="text-slate-600">{{ t('Subtotal') }}</dt><dd>{{ formatMoney(order.subtotal) }}</dd></div>
              <div v-if="Number(order.discountAmount) > 0" class="flex justify-between text-emerald-800">
                <dt>{{ t('Discount') }}<template v-if="order.discountCode"> ({{ order.discountCode }})</template></dt>
                <dd>&minus;{{ formatMoney(order.discountAmount) }}</dd>
              </div>
              <div class="flex justify-between"><dt class="text-slate-600">{{ t('Delivery') }}</dt><dd>{{ formatMoney(order.deliveryFee) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-600">{{ t('Tax') }}</dt><dd>{{ formatMoney(order.taxAmount) }}</dd></div>
              <div class="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <dt>{{ t('Total') }}</dt><dd>{{ formatMoney(order.totalAmount) }}</dd>
              </div>
            </dl>
            <p class="mt-2 text-xs text-slate-500">{{ order.paymentMethod === 'CARD' ? t('Paid by card') : t('Cash on delivery') }}</p>
          </div>
        </aside>
      </div>

      <RouterLink :to="{ name: 'restaurant-orders' }"
                  class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
        {{ t('Back to orders') }}
      </RouterLink>
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmReason" @cancel="dialog.open = false" />
  </div>
</template>
