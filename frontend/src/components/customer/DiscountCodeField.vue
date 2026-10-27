<script setup>
import { ref, defineAsyncComponent } from 'vue';
import { useCartStore } from '../../stores/cart.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { discountErrorText } from '../../utils/discount.js';
import { formatMoney } from '../../utils/money.js';
import AppButton from '../shared/AppButton.vue';
import { t } from '../../i18n/index.js';

/**
 * Enter, see and remove a discount code on the cart. It only sends the code:
 * the amount, the new total and every failure come from the server.
 */
const props = defineProps({ id: { type: String, default: 'discount-code' } });

const isDev = import.meta.env.DEV;
const DevDiscountCodes = import.meta.env.DEV
  ? defineAsyncComponent(() => import('./DevDiscountCodes.vue'))
  : null;

const cart = useCartStore();
const ui = useUiStore();
const code = ref('');
const busy = ref(false);
const error = ref(null);

async function apply() {
  const value = code.value.trim();
  if (!value) {
    error.value = t('Enter a discount code.');
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    await cart.applyDiscount(value);
    code.value = '';
    ui.toast(t('Discount code {code} applied', { code: cart.discount?.code ?? value.toUpperCase() }));
  } catch (err) {
    error.value = discountErrorText(err);
  } finally {
    busy.value = false;
  }
}

/** A development code picked from the list: fill it in and apply it. */
function applyPicked(value) {
  code.value = value;
  apply();
}

async function remove() {
  busy.value = true;
  error.value = null;
  try {
    await cart.removeDiscount();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mt-4 border-t border-slate-200 pt-4">
    <!-- Applied: the code and its saving, with a way to take it off. -->
    <div v-if="cart.discount" class="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <span>
        <span class="font-semibold">{{ cart.discount.code }}</span>
        &mdash; {{ t('you save {amount}', { amount: formatMoney(cart.discount.amount) }) }}
      </span>
      <button type="button" class="action-link text-xs underline" :disabled="busy" @click="remove">
        {{ t('Remove') }}
      </button>
    </div>

    <!-- A stored code the server no longer accepts, with the reason. -->
    <div v-else-if="cart.discountIssue" class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
      <span class="font-semibold">{{ cart.discountIssue.discountCode }}</span>:
      {{ discountErrorText(cart.discountIssue) }}
      <button type="button" class="action-link ms-2 text-xs underline" :disabled="busy" @click="remove">
        {{ t('Remove code') }}
      </button>
    </div>

    <form v-else novalidate @submit.prevent="apply">
      <label :for="props.id" class="field-label">{{ t('Discount code') }}</label>
      <div class="flex gap-2">
        <input :id="props.id" v-model="code" type="text" maxlength="40" autocomplete="off"
               class="field-input min-w-0 flex-1 uppercase" :aria-invalid="Boolean(error)"
               :aria-describedby="error ? `${props.id}-error` : undefined">
        <AppButton type="submit" variant="secondary" :loading="busy">{{ t('Apply') }}</AppButton>
      </div>
      <p v-if="error" :id="`${props.id}-error`" class="field-error" role="alert">{{ error }}</p>
      <DevDiscountCodes v-if="isDev" @pick="applyPicked" />
    </form>
  </div>
</template>
