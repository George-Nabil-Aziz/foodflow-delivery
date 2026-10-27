<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { orderApi } from '../../services/api.js';
import AppButton from '../shared/AppButton.vue';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';

/**
 * The only provider-specific piece of the frontend. Takes the payment the
 * server created (its amount, currency and publishable key - never an input)
 * and renders the gateway's own card form, so card details go from the
 * browser to the gateway and never through FoodFlow. When the customer is
 * done it emits `paid` with the gateway's payment id; the server then asks
 * the gateway whether that payment is real. Another gateway means another
 * branch here and nothing else.
 */
const props = defineProps({
  orderId: { type: String, required: true },
  orderNumber: { type: String, required: true },
  payment: { type: Object, required: true },
});
const emit = defineEmits(['paid']);

// Moyasar Payment Form (https://docs.moyasar.com). Pin the version.
const MOYASAR_JS = 'https://cdn.moyasar.com/mpf/1.14.0/moyasar.js';
const MOYASAR_CSS = 'https://cdn.moyasar.com/mpf/1.14.0/moyasar.css';

const loadError = ref(null);
const busy = ref(false);
const formEl = ref(null);

function loadAsset(tag, attrs) {
  return new Promise((resolve, reject) => {
    const key = attrs.src ?? attrs.href;
    if (document.querySelector(`[data-asset="${key}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    el.dataset.asset = key;
    el.onload = resolve;
    el.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(el);
  });
}

async function mountMoyasar() {
  try {
    await Promise.all([
      loadAsset('link', { rel: 'stylesheet', href: MOYASAR_CSS }),
      loadAsset('script', { src: MOYASAR_JS }),
    ]);
    // The gateway counts in the minor unit (1/100); the server's amount stays the source.
    window.Moyasar.init({
      element: formEl.value,
      amount: Math.round(Number(props.payment.amount) * 100),
      currency: props.payment.currency,
      description: `FoodFlow order ${props.orderNumber}`,
      publishable_api_key: props.payment.publishableKey,
      // After 3-D Secure the gateway returns here with ?id=<payment id>&status=...
      callback_url: `${window.location.origin}/orders/${props.orderId}`,
      methods: ['creditcard'],
      supported_networks: ['visa', 'mastercard', 'mada'],
      // The reference the server matches the payment back to.
      metadata: { payment_ref: props.payment.id },
      on_completed: (gatewayPayment) => { emit('paid', gatewayPayment.id); },
    });
  } catch {
    loadError.value = t('The payment form could not be loaded. Check your connection and try again.');
  }
}

/** Development stand-in for the gateway page (server fake provider). */
async function payWithTestCard() {
  busy.value = true;
  try {
    const { data } = await orderApi.simulatePayment(props.orderId);
    emit('paid', data.providerPaymentId);
  } finally {
    busy.value = false;
  }
}

onMounted(() => { if (props.payment.provider === 'moyasar') mountMoyasar(); });
onBeforeUnmount(() => { if (formEl.value) formEl.value.replaceChildren(); });
</script>

<template>
  <div>
    <p class="text-sm text-slate-700">
      {{ t('Amount to pay: {amount}', { amount: formatMoney(payment.amount) }) }}
    </p>

    <div v-if="payment.provider === 'moyasar'" class="mt-3">
      <div ref="formEl" />
      <p v-if="loadError" class="mt-2 text-sm text-red-800" role="alert">{{ loadError }}</p>
    </div>

    <div v-else class="mt-3">
      <p class="text-sm text-slate-600">
        {{ t('Test mode: no real payment gateway is configured, so no card is charged.') }}
      </p>
      <AppButton class="mt-2" :loading="busy" @click="payWithTestCard">{{ t('Pay with test card') }}</AppButton>
    </div>
  </div>
</template>
