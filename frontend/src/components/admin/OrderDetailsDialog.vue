<script setup>
import { computed, ref, watch } from 'vue';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import { capitalize, enumText } from '../../utils/labels.js';
import { PAYMENT_STATUS_LABEL } from '../../utils/orderStatus.js';
import DetailsDialog from '../shared/DetailsDialog.vue';
import AppButton from '../shared/AppButton.vue';

/**
 * One order, everything an admin can see: both parties, the driver, the
 * address, the money and the items. Loads the full order on open, because
 * every list that links here only carries a summary.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  orderId: { type: String, default: null },
  orderNumber: { type: String, default: '' },
});
const emit = defineEmits(['close']);

const ui = useUiStore();
const order = ref(null);
const loading = ref(false);
const retrying = ref(false);

watch(() => [props.open, props.orderId], async ([open, id]) => {
  if (!open || !id) return;
  order.value = null;
  loading.value = true;
  try {
    order.value = (await adminApi.order(id)).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
});

/** Re-runs a failed refund; the server audits the attempt and records the outcome. */
async function retryRefund() {
  retrying.value = true;
  try {
    const { data } = await adminApi.refundPayment(order.value.payment.id);
    if (data.outcome === 'REFUNDED') ui.toastSuccess(t('Refund completed'));
    else ui.toastError(t('The refund failed again: {reason}', { reason: data.refundError ?? '' }));
    order.value = (await adminApi.order(order.value.id)).data;
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    retrying.value = false;
  }
}

const addressText = (a) => (a ? [a.line1, a.district, a.city].filter(Boolean).join(', ') : '');

const fields = computed(() => {
  const o = order.value;
  if (!o) return [];
  return [
    { label: t('Status'), value: enumText(o.status) },
    { label: t('Restaurant'), value: o.restaurant?.name },
    { label: t('Customer'), value: o.customer?.fullName },
    { label: t('Customer email'), value: o.customer?.email },
    { label: t('Customer phone'), value: o.customer?.phone },
    { label: t('Driver'), value: o.driver ? [o.driver.fullName, o.driver.phone].filter(Boolean).join(' · ') : capitalize(t('no driver yet')) },
    { label: t('Delivery address'), value: addressText(o.deliveryAddress) },
    { label: t('Payment'), value: o.paymentMethod && enumText(o.paymentMethod) },
    ...(o.payment ? [
      { label: t('Payment status'), value: t(PAYMENT_STATUS_LABEL[o.payment.status] ?? o.payment.status) },
      ...(o.payment.providerPaymentId ? [{ label: t('Gateway payment'), value: o.payment.providerPaymentId }] : []),
      ...(Number(o.payment.refundedAmount) > 0 ? [{ label: t('Refunded'), value: formatMoney(o.payment.refundedAmount) }] : []),
      ...(o.payment.failureMessage ? [{ label: t('Payment failure'), value: o.payment.failureMessage }] : []),
      ...(o.payment.refundError ? [{ label: t('Refund error'), value: o.payment.refundError }] : []),
    ] : []),
    { label: t('Subtotal'), value: formatMoney(o.subtotal) },
    ...(Number(o.discountAmount) > 0
      ? [{
        label: o.discountCode ? t('Discount ({code})', { code: o.discountCode }) : t('Discount'),
        value: `−${formatMoney(o.discountAmount)}`,
      }]
      : []),
    { label: t('Delivery fee'), value: formatMoney(o.deliveryFee) },
    { label: t('Tax'), value: formatMoney(o.taxAmount) },
    { label: t('Total'), value: formatMoney(o.totalAmount) },
    ...(o.customerNote ? [{ label: t('Customer note'), value: o.customerNote }] : []),
    { label: t('Placed'), value: formatDateTime(o.placedAt) },
    ...(o.deliveredAt ? [{ label: t('Delivered'), value: formatDateTime(o.deliveredAt) }] : []),
    ...(o.cancelledAt ? [
      { label: t('Cancelled'), value: formatDateTime(o.cancelledAt) },
      { label: t('Cancellation reason'), value: [o.cancellationReason && enumText(o.cancellationReason), o.cancellationNote].filter(Boolean).join(' — ') },
    ] : []),
  ];
});
</script>

<template>
  <DetailsDialog :open="open" :loading="loading"
                 :title="t('Order {orderNumber}', { orderNumber: order?.orderNumber ?? orderNumber })"
                 :fields="fields" @close="emit('close')">
    <div v-if="order?.payment?.status === 'REFUND_FAILED'"
         class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
      <p>{{ t('The customer’s card refund failed and needs your attention.') }}</p>
      <AppButton class="mt-2" size="sm" :loading="retrying" @click="retryRefund">{{ t('Retry refund') }}</AppButton>
    </div>
    <template v-if="order?.items?.length">
      <h3 class="mt-5 text-sm font-semibold text-slate-900">{{ t('Items') }}</h3>
      <ul class="mt-2 divide-y divide-slate-100 text-sm">
        <li v-for="item in order.items" :key="item.id" class="flex justify-between gap-3 py-2">
          <span class="min-w-0 text-slate-900">
            {{ item.quantity }} × {{ item.name }}
            <span v-if="item.notes" class="block text-xs text-slate-500">{{ item.notes }}</span>
          </span>
          <span class="shrink-0 text-slate-700">{{ formatMoney(item.lineTotal) }}</span>
        </li>
      </ul>
    </template>
  </DetailsDialog>
</template>
