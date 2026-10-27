<script setup>
import { computed, ref, watch } from 'vue';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import { capitalize, enumText } from '../../utils/labels.js';
import DetailsDialog from '../shared/DetailsDialog.vue';

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
