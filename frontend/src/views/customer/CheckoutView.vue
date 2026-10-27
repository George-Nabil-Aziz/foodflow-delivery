<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { addressApi, orderApi, paymentApi } from '../../services/api.js';
import { useCartStore } from '../../stores/cart.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { CART_ISSUE_LABEL } from '../../utils/orderStatus.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import AppButton from '../../components/shared/AppButton.vue';
import LineOptions from '../../components/shared/LineOptions.vue';
import DiscountCodeField from '../../components/customer/DiscountCodeField.vue';
import { discountErrorText, isPositiveAmount } from '../../utils/discount.js';
import EmptyState from '../../components/shared/EmptyState.vue';
import { t } from '../../i18n/index.js';

const cart = useCartStore();
const ui = useUiStore();
const router = useRouter();

const addresses = ref([]);
const selectedAddressId = ref(null);
const customerNote = ref('');
const loading = ref(true);
const placing = ref(false);
const checkoutError = ref(null);
const paymentMethod = ref('CASH_ON_DELIVERY');
const cardEnabled = ref(false);

onMounted(async () => {
  try {
    // A failing config call just hides the card option; cash always works.
    paymentApi.config().then((res) => { cardEnabled.value = res.data.cardEnabled; }).catch(() => {});
    const [cartRes, addressRes] = await Promise.all([cart.load(), addressApi.list()]);
    addresses.value = addressRes.data;
    selectedAddressId.value = addresses.value.find((a) => a.isDefault)?.id ?? addresses.value[0]?.id ?? null;
    return cartRes;
  } catch (err) {
    ui.toastError(err.message);
    return null;
  } finally {
    loading.value = false;
  }
});

const canPlace = computed(() => cart.canCheckout && Boolean(selectedAddressId.value) && !placing.value);

/** Maps each documented checkout failure to a specific, actionable message. */
function messageFor(err) {
  switch (err.code) {
    case 'CART_EMPTY':
      return t('Your cart is empty.');
    case 'CART_HAS_ISSUES':
      return t('Some items changed while you were shopping. Review your cart and try again.');
    case 'BELOW_MINIMUM_ORDER': {
      const detail = err.details?.[0];
      return detail
        ? t('This restaurant has a minimum order of {required}. Your subtotal is {actual}.', {
          required: formatMoney(detail.required),
          actual: formatMoney(detail.actual),
        })
        : t('Your order is below this restaurant’s minimum.');
    }
    case 'RESTAURANT_UNAVAILABLE':
      return t('This restaurant stopped accepting orders. Your cart has been kept.');
    case 'CARD_PAYMENTS_UNAVAILABLE':
      return t('Card payments are not available right now. Choose cash on delivery.');
    case 'RESOURCE_NOT_FOUND':
      return t('That delivery address is no longer available. Choose another.');
    case 'DISCOUNT_CODE_INVALID':
    case 'DISCOUNT_CODE_EXPIRED':
    case 'DISCOUNT_CODE_NOT_APPLICABLE':
    case 'DISCOUNT_CODE_LIMIT_REACHED':
      // The cart is reloaded below and shows the code with this reason; removing it unblocks checkout.
      return discountErrorText(err);
    default:
      return err.message;
  }
}

async function placeOrder() {
  checkoutError.value = null;
  placing.value = true;
  try {
    // Note what is NOT sent: no prices. Every figure is computed server-side.
    const { data } = await orderApi.checkout({
      addressId: selectedAddressId.value,
      customerNote: customerNote.value || undefined,
      paymentMethod: paymentMethod.value,
    });
    cart.reset();
    await cart.load().catch(() => {});
    const isCard = data.paymentMethod === 'CARD';
    ui.toastSuccess(isCard
      ? t('Order {number} created. Complete the payment to send it to the restaurant.', { number: data.orderNumber })
      : t('Order {number} placed', { number: data.orderNumber }));
    // A card order goes straight to its page, where the payment form waits.
    router.push({ name: 'order-detail', params: { id: data.id } });
  } catch (err) {
    checkoutError.value = messageFor(err);
    await cart.load().catch(() => {});
  } finally {
    placing.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Checkout') }}</h1>

    <AppSpinner v-if="loading" label="Loading checkout" />

    <EmptyState v-else-if="cart.isEmpty" class="mt-4"
                title="Your cart is empty"
                message="Add something before checking out.">
      <RouterLink to="/restaurants" class="action-link text-brand-700 hover:underline">{{ t('Browse restaurants') }}</RouterLink>
    </EmptyState>

    <div v-else class="mt-4 grid gap-6 lg:grid-cols-3">
      <section class="space-y-6 lg:col-span-2">
        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Delivery address') }}</h2>

          <EmptyState v-if="addresses.length === 0" class="mt-3"
                      title="No saved addresses"
                      message="Add an address before you can place an order.">
            <RouterLink :to="{ name: 'address-new', query: { from: 'checkout' } }" class="action-link text-brand-700 hover:underline">
              {{ t('Add an address') }}
            </RouterLink>
          </EmptyState>

          <ul v-else class="mt-3 space-y-2">
            <li v-for="address in addresses" :key="address.id">
              <label class="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                     :class="selectedAddressId === address.id
                       ? 'border-brand-500 bg-brand-50' : 'border-slate-200'">
                <input v-model="selectedAddressId" type="radio" :value="address.id" class="mt-1">
                <span class="text-sm">
                  <span class="font-medium text-slate-900">{{ address.label || t('Address') }}</span>
                  <span v-if="address.isDefault" class="ms-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs">{{ t('Default') }}</span>
                  <span class="block text-slate-600">
                    {{ address.line1 }}<template v-if="address.district">, {{ address.district }}</template>, {{ address.city }}
                  </span>
                </span>
              </label>
            </li>
          </ul>
        </div>

        <div class="card p-4">
          <label for="order-note" class="field-label">{{ t('Note for the restaurant (optional)') }}</label>
          <textarea id="order-note" v-model="customerNote" rows="3" maxlength="500" class="field-input"
                    :placeholder="t('Ring the bell twice')" />
          <p class="mt-1 text-xs text-slate-500">{{ customerNote.length }}/500</p>
        </div>

        <div class="card p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Payment') }}</h2>
          <div class="mt-3 space-y-2">
            <label class="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                   :class="paymentMethod === 'CASH_ON_DELIVERY' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'">
              <input v-model="paymentMethod" type="radio" value="CASH_ON_DELIVERY" class="mt-1">
              <span class="text-sm">
                <span class="font-medium text-slate-900">{{ t('Cash on delivery') }}</span>
                <span class="block text-slate-600">{{ t('Pay the driver when your order arrives.') }}</span>
              </span>
            </label>
            <label v-if="cardEnabled" class="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                   :class="paymentMethod === 'CARD' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'">
              <input v-model="paymentMethod" type="radio" value="CARD" class="mt-1">
              <span class="text-sm">
                <span class="font-medium text-slate-900">{{ t('Card') }}</span>
                <span class="block text-slate-600">
                  {{ t('Pay now with a credit or debit card. The restaurant receives your order once the payment succeeds.') }}
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <aside>
        <div class="card sticky top-4 p-4">
          <h2 class="font-semibold text-slate-900">{{ cart.restaurant?.name }}</h2>

          <ul class="mt-3 space-y-1 text-sm">
            <li v-for="item in cart.items" :key="item.id" class="flex justify-between gap-2">
              <span class="text-slate-700">
                {{ item.quantity }} &times; {{ item.name }}
                <LineOptions :options="item.options" :notes="item.notes" />
              </span>
              <span>{{ formatMoney(item.lineTotal) }}</span>
            </li>
          </ul>

          <dl class="mt-3 space-y-2 border-t border-slate-200 pt-3 text-sm">
            <div class="flex justify-between"><dt class="text-slate-600">{{ t('Subtotal') }}</dt><dd>{{ formatMoney(cart.totals.subtotal) }}</dd></div>
            <div v-if="isPositiveAmount(cart.totals.discountAmount)" class="flex justify-between text-emerald-800">
              <dt>{{ t('Discount') }}<template v-if="cart.discount"> ({{ cart.discount.code }})</template></dt>
              <dd>&minus;{{ formatMoney(cart.totals.discountAmount) }}</dd>
            </div>
            <div class="flex justify-between"><dt class="text-slate-600">{{ t('Delivery') }}</dt><dd>{{ formatMoney(cart.totals.deliveryFee) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-600">{{ t('Tax') }}</dt><dd>{{ formatMoney(cart.totals.taxAmount) }}</dd></div>
            <div class="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <dt>{{ t('Total') }}</dt><dd>{{ formatMoney(cart.totals.total) }}</dd>
            </div>
          </dl>

          <DiscountCodeField id="checkout-discount-code" />

          <p v-if="checkoutError" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {{ checkoutError }}
          </p>

          <ul v-if="cart.issues.length" class="mt-3 space-y-1">
            <li v-for="issue in cart.issues" :key="issue"
                class="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              {{ t(CART_ISSUE_LABEL[issue] || issue) }}
            </li>
          </ul>

          <AppButton class="mt-4 w-full" :loading="placing" :disabled="!canPlace" @click="placeOrder">
            {{ t('Place order') }}
          </AppButton>

          <p v-if="!cart.canCheckout && cart.discountIssue" class="mt-2 text-sm text-slate-700" role="status">
            {{ t('Remove the discount code above or choose another to place your order.') }}
          </p>
          <p v-else-if="!cart.canCheckout" class="mt-2 text-sm text-slate-700" role="status">
            {{ t('Resolve the items above before placing your order.') }}
          </p>
          <p v-else-if="!selectedAddressId" class="mt-2 text-sm text-slate-700" role="status">
            {{ t('Choose a delivery address.') }}
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
