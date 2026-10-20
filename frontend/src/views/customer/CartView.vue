<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useCartStore } from '../../stores/cart.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { CART_ISSUE_LABEL, UNAVAILABLE_REASON_LABEL } from '../../utils/orderStatus.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import { t } from '../../i18n/index.js';

const cart = useCartStore();
const ui = useUiStore();
const router = useRouter();
const busy = ref(null);

onMounted(() => cart.load().catch((err) => ui.toastError(err.message)));

/**
 * The reason checkout is blocked, stated as text. `canCheckout` is the server's
 * verdict; this only explains it.
 */
const blockedReason = computed(() => {
  if (cart.isEmpty) return t('Your cart is empty.');
  if (cart.restaurant && !cart.restaurant.isOrderable) {
    return t(UNAVAILABLE_REASON_LABEL[cart.restaurant.unavailableReason]
      ?? 'This restaurant is not accepting orders right now.');
  }
  if (cart.issues.length) return t('Some items need your attention before you can check out.');
  if (!cart.meetsMinimum) {
    return t('Add {amount} more to reach this restaurant\'s minimum order.', {
      amount: formatMoney(cart.minimumShortfall),
    });
  }
  return null;
});

async function setQuantity(item, quantity) {
  if (quantity < 1 || quantity > 20) return;
  busy.value = item.id;
  try {
    await cart.updateQuantity(item.id, quantity);
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

async function remove(item) {
  busy.value = item.id;
  try {
    await cart.removeItem(item.id);
    ui.toast(t('{name} removed', { name: item.name }));
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Your cart') }}</h1>

    <AppSpinner v-if="cart.loading && !cart.loaded" label="Loading your cart" />

    <EmptyState v-else-if="cart.isEmpty" class="mt-4"
                title="Your cart is empty"
                message="Find something you like and add it here.">
      <RouterLink to="/restaurants"
                  class="ui-control inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
        {{ t('Browse restaurants') }}
      </RouterLink>
    </EmptyState>

    <div v-else class="mt-4 grid gap-6 lg:grid-cols-3">
      <section class="lg:col-span-2">
        <div class="card p-4">
          <p class="text-sm text-slate-600">{{ t('Ordering from') }}</p>
          <h2 class="text-lg font-semibold text-slate-900">{{ cart.restaurant?.name }}</h2>
          <p v-if="cart.restaurant && !cart.restaurant.isOrderable"
             class="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
             role="status">
            {{ t(UNAVAILABLE_REASON_LABEL[cart.restaurant.unavailableReason] || 'Not accepting orders right now') }}.
            {{ t('Your items are saved.') }}
          </p>
        </div>

        <ul class="mt-4 space-y-3">
          <li v-for="item in cart.items" :key="item.id" class="card p-4">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <h3 class="font-medium text-slate-900">{{ item.name }}</h3>
                <p class="mt-1 text-sm text-slate-600">{{ t('{price} each', { price: formatMoney(item.unitPrice) }) }}</p>

                <!-- Issues are shown per line, with the resolution next to them. -->
                <ul v-if="item.issues.length" class="mt-2 space-y-1">
                  <li v-for="issue in item.issues" :key="issue"
                      class="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    {{ t(CART_ISSUE_LABEL[issue] || issue) }}
                    <template v-if="issue === 'PRICE_CHANGED'">
                      &mdash; {{ t('now {price}', { price: formatMoney(item.unitPrice) }) }}
                    </template>
                  </li>
                </ul>
              </div>

              <div class="shrink-0 text-end">
                <p class="font-semibold text-slate-900">{{ formatMoney(item.lineTotal) }}</p>

                <div class="mt-2 flex items-center justify-end gap-1">
                  <button type="button" class="h-8 w-8 rounded border border-slate-300 disabled:text-slate-300"
                          :disabled="item.quantity <= 1 || busy === item.id"
                          :aria-label="item.quantity <= 1
                            ? t('Minimum quantity is 1; use remove instead')
                            : t('Decrease quantity of {name}', { name: item.name })"
                          @click="setQuantity(item, item.quantity - 1)">
&minus;
</button>
                  <span class="w-8 text-center text-sm" aria-live="polite">{{ item.quantity }}</span>
                  <button type="button" class="h-8 w-8 rounded border border-slate-300 disabled:text-slate-300"
                          :disabled="item.quantity >= 20 || busy === item.id"
                          :aria-label="item.quantity >= 20
                            ? t('Maximum quantity is 20')
                            : t('Increase quantity of {name}', { name: item.name })"
                          @click="setQuantity(item, item.quantity + 1)">
+
</button>
                </div>

                <button type="button" class="action-link mt-2 text-xs text-red-700 hover:underline"
                        :disabled="busy === item.id" @click="remove(item)">
                  {{ t('Remove') }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <aside>
        <div class="card sticky top-4 p-4">
          <h2 class="font-semibold text-slate-900">{{ t('Order summary') }}</h2>
          <dl class="mt-3 space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-slate-600">{{ t('Subtotal') }}</dt><dd>{{ formatMoney(cart.totals.subtotal) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-600">{{ t('Delivery') }}</dt><dd>{{ formatMoney(cart.totals.deliveryFee) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-600">{{ t('Tax') }}</dt><dd>{{ formatMoney(cart.totals.taxAmount) }}</dd></div>
            <div class="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <dt>{{ t('Total') }}</dt><dd>{{ formatMoney(cart.totals.total) }}</dd>
            </div>
          </dl>

          <AppButton class="mt-4 w-full" :disabled="!cart.canCheckout"
                     @click="router.push({ name: 'checkout' })">
            {{ t('Go to checkout') }}
          </AppButton>

          <!-- The disabled reason is text, never conveyed by styling alone. -->
          <p v-if="blockedReason" class="mt-2 text-sm text-slate-700" role="status">
            {{ blockedReason }}
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
