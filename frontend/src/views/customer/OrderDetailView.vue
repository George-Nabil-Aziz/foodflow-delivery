<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { orderApi, reviewApi } from '../../services/api.js';
import { useLiveUpdates } from '../../composables/useLiveUpdates.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import {
  CANCELLATION_REASONS, canCustomerCancel, isTerminal, STATUS_LABEL,
} from '../../utils/orderStatus.js';
import { formatDateTime } from '../../utils/datetime.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import LineOptions from '../../components/shared/LineOptions.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';
import PaymentBadge from '../../components/shared/PaymentBadge.vue';
import PaymentForm from '../../components/customer/PaymentForm.vue';
import StarRating from '../../components/shared/StarRating.vue';
import OrderTimeline from '../../components/customer/OrderTimeline.vue';
import { locale, t } from '../../i18n/index.js';

const route = useRoute();
const ui = useUiStore();

const order = ref(null);
const loading = ref(true);
const error = ref(null);
const cancelling = ref(false);
const submittingReview = ref(false);
const paymentNote = ref(null);
const review = ref({ restaurantRating: null, driverRating: null, comment: '' });

async function load() {
  loading.value = true;
  error.value = null;
  try {
    order.value = (await orderApi.get(route.params.id)).data;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

/**
 * Refreshes from the lightweight status endpoint: on a pushed event for THIS
 * order while the live stream is up, by polling when it is not. Stops for good
 * at a terminal status. Pausing while the tab is hidden is handled by the
 * composable.
 */
const polling = useLiveUpdates(
  async () => (await orderApi.status(route.params.id)).data,
  {
    events: ['order.status', 'order.updated'],
    filter: (event) => event.orderId === route.params.id,
    shouldStop: (status) => isTerminal(status.status),
    immediate: false,
  },
);

/**
 * Hands the gateway's payment id to the server, which asks the gateway whether
 * it is paid and for the right amount. Nothing here decides that.
 */
async function confirmPayment(providerPaymentId) {
  paymentNote.value = null;
  try {
    order.value = (await orderApi.confirmPayment(route.params.id, providerPaymentId)).data;
    const state = order.value.payment?.status;
    if (state === 'FAILED') paymentNote.value = order.value.payment.failureMessage || t('The payment was declined. You can try again.');
    else if (state === 'INITIATED') paymentNote.value = t('Your payment is still being processed.');
  } catch (err) {
    paymentNote.value = err.details?.[0]?.issue ?? err.message;
  }
}

onMounted(async () => {
  await load();
  // Back from the gateway's 3-D Secure page: it appends ?id=<payment id>.
  if (order.value?.payment && route.query.id) await confirmPayment(String(route.query.id));
  if (order.value && !isTerminal(order.value.status)) polling.start();
});

// Merge polled status into the loaded order, so the timeline stays live
// without refetching the whole payload on every tick.
const displayStatus = computed(() => polling.data.value?.status ?? order.value?.status);
const displayTimeline = computed(() => polling.data.value?.timeline ?? order.value?.timeline ?? []);
const displayDriver = computed(() => polling.data.value?.driver ?? order.value?.driver);
const dispatchState = computed(() => polling.data.value?.dispatchState ?? order.value?.dispatchState);

const showFindingDriver = computed(
  () => dispatchState.value === 'UNASSIGNED'
    && ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(displayStatus.value),
);

const needsPayment = computed(
  () => order.value?.status === 'PENDING'
    && ['INITIATED', 'FAILED'].includes(order.value?.payment?.status),
);

const canCancel = computed(() => canCustomerCancel(displayStatus.value));
const canReview = computed(() => displayStatus.value === 'DELIVERED' && order.value?.canReview);

/**
 * The cancellation reason as shown to the customer. English keeps the plain
 * lower-cased code; Arabic uses the translated reason label when there is one.
 */
function reasonText(code) {
  const label = CANCELLATION_REASONS.find((r) => r.value === code)?.label;
  if (locale.value !== 'en' && label) return t(label);
  return code.replaceAll('_', ' ').toLowerCase();
}

async function cancel() {
  cancelling.value = true;
  try {
    order.value = (await orderApi.cancel(route.params.id)).data;
    polling.stop();
    ui.toast('Your order was cancelled');
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
    await load();
  } finally {
    cancelling.value = false;
  }
}

async function submitReview() {
  submittingReview.value = true;
  try {
    await reviewApi.create({
      orderId: order.value.id,
      restaurantRating: review.value.restaurantRating,
      driverRating: review.value.driverRating || undefined,
      comment: review.value.comment || undefined,
    });
    ui.toastSuccess('Thank you for your review');
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    submittingReview.value = false;
  }
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
          <p class="mt-1 text-sm text-slate-600">
            {{ order.restaurant.name }} &middot; {{ t('placed {date}', { date: formatDateTime(order.placedAt) }) }}
          </p>
        </div>
        <StatusBadge :status="displayStatus" />
      </div>

      <div class="mt-5 grid gap-6 lg:grid-cols-3">
        <section class="space-y-4 lg:col-span-2">
          <div class="card p-4">
            <h2 class="font-semibold text-slate-900">{{ t('Progress') }}</h2>

            <p v-if="order.cancellationReason"
               class="mt-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              <template v-if="order.cancelledBy === 'RESTAURANT'">{{ t('Rejected by the restaurant') }}</template>
              <template v-else-if="order.cancelledBy === 'SYSTEM'">{{ t('Cancelled automatically') }}</template>
              <template v-else-if="order.cancelledBy === 'ADMIN'">{{ t('Cancelled by FoodFlow') }}</template>
              <template v-else>{{ t('Cancelled') }}</template>
              &mdash; {{ reasonText(order.cancellationReason) }}
              <span v-if="order.cancellationNote" class="block text-slate-600">{{ order.cancellationNote }}</span>
            </p>

            <!-- No driver yet is a state, not an error. -->
            <p v-if="showFindingDriver"
               class="mt-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900"
               role="status">
              {{ t('Finding a driver for your order.') }}
            </p>

            <section v-if="order.payment" class="mt-3 rounded-lg border border-slate-200 p-3 text-sm"
                     aria-labelledby="payment-heading">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 id="payment-heading" class="font-medium text-slate-900">{{ t('Card payment') }}</h3>
                <PaymentBadge :status="order.payment.status" />
              </div>
              <p v-if="order.payment.status === 'REFUNDED'" class="mt-2 text-slate-700">
                {{ t('{amount} was refunded to your card.', { amount: formatMoney(order.payment.refundedAmount) }) }}
              </p>
              <p v-else-if="['REFUNDING', 'REFUND_FAILED'].includes(order.payment.status)" class="mt-2 text-slate-700">
                {{ t('Your order was cancelled and your refund is being processed.') }}
              </p>
              <p v-else-if="order.payment.status === 'PAID'" class="mt-2 text-slate-700">
                {{ t('Paid {amount}.', { amount: formatMoney(order.payment.amount) }) }}
              </p>
              <p v-if="paymentNote" class="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900" role="status">
                {{ paymentNote }}
              </p>
              <div v-if="needsPayment" class="mt-3">
                <p class="text-slate-600">{{ t('The restaurant will see your order once the payment succeeds.') }}</p>
                <PaymentForm :order-id="order.id" :order-number="order.orderNumber" :payment="order.payment"
                             @paid="confirmPayment" />
              </div>
            </section>

            <div class="mt-4"><OrderTimeline :timeline="displayTimeline" :current-status="displayStatus" /></div>

            <div v-if="displayDriver" class="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
              <p class="font-medium text-slate-900">{{ t('Your driver') }}</p>
              <p class="text-slate-700">{{ displayDriver.firstName }} &middot; {{ displayDriver.phone }}</p>
            </div>

            <AppButton v-if="canCancel" variant="danger" size="sm" class="mt-4"
                       :loading="cancelling" @click="cancel">
              {{ t('Cancel order') }}
            </AppButton>
            <p v-else-if="!isTerminal(displayStatus)" class="mt-4 text-sm text-slate-600">
              {{ t('This order is {status} and can no longer be cancelled.', {
                status: t(STATUS_LABEL[displayStatus]).toLowerCase(),
              }) }}
            </p>
          </div>

          <div v-if="canReview" class="card p-4">
            <h2 class="font-semibold text-slate-900">{{ t('Rate your order') }}</h2>
            <form class="mt-3 space-y-4" @submit.prevent="submitReview">
              <StarRating v-model="review.restaurantRating" name="restaurant-rating"
                          :label="t('How was the food?')" />
              <!-- The driver section appears only when a driver delivered. -->
              <StarRating v-if="order.driver || order.deliveredAt" v-model="review.driverRating"
                          name="driver-rating" :label="t('How was the delivery? (optional)')" />
              <div>
                <label for="review-comment" class="field-label">{{ t('Comment (optional)') }}</label>
                <textarea id="review-comment" v-model="review.comment" rows="3" maxlength="1000"
                          class="field-input" />
                <p class="mt-1 text-xs text-slate-500">{{ review.comment.length }}/1000</p>
              </div>
              <AppButton type="submit" :loading="submittingReview" :disabled="!review.restaurantRating">
                {{ t('Submit review') }}
              </AppButton>
              <p v-if="!review.restaurantRating" class="text-sm text-slate-600">
                {{ t('Choose a rating for the food to submit.') }}
              </p>
            </form>
          </div>
        </section>

        <aside class="space-y-4">
          <div class="card p-4">
            <h2 class="font-semibold text-slate-900">{{ t('Items') }}</h2>
            <ul class="mt-3 space-y-2 text-sm">
              <li v-for="item in order.items" :key="item.id" class="flex justify-between gap-2">
                <span class="text-slate-700">
                  {{ item.quantity }} &times; {{ item.name }}
                  <LineOptions :options="item.options" :notes="item.notes" />
                </span>
                <span>{{ formatMoney(item.lineTotal) }}</span>
              </li>
            </ul>
            <dl class="mt-3 space-y-2 border-t border-slate-200 pt-3 text-sm">
              <div class="flex justify-between"><dt class="text-slate-600">{{ t('Subtotal') }}</dt><dd>{{ formatMoney(order.subtotal) }}</dd></div>
              <div v-if="Number(order.discountAmount) > 0" class="flex justify-between text-emerald-800">
                <dt>{{ t('Discount') }}<template v-if="order.discountCode"> ({{ order.discountCode }})</template></dt>
                <dd>&minus;{{ formatMoney(order.discountAmount) }}</dd>
              </div>
              <div class="flex justify-between"><dt class="text-slate-600">{{ t('Delivery') }}</dt><dd>{{ formatMoney(order.deliveryFee) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-600">{{ t('Tax') }}</dt><dd>{{ formatMoney(order.taxAmount) }}</dd></div>
              <div class="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                <dt>{{ t('Total') }}</dt><dd>{{ formatMoney(order.totalAmount) }}</dd>
              </div>
            </dl>
          </div>

          <div class="card p-4 text-sm">
            <h2 class="font-semibold text-slate-900">{{ t('Delivering to') }}</h2>
            <address class="mt-2 not-italic text-slate-700">
              {{ order.deliveryAddress.line1 }}<br>
              <template v-if="order.deliveryAddress.district">{{ order.deliveryAddress.district }}, </template>
              {{ order.deliveryAddress.city }}
            </address>
            <p v-if="order.customerNote" class="mt-2 text-slate-600">{{ t('Note: {note}', { note: order.customerNote }) }}</p>
          </div>
        </aside>
      </div>

      <RouterLink to="/orders" class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
        {{ t('Back to my orders') }}
      </RouterLink>
    </template>
  </div>
</template>
