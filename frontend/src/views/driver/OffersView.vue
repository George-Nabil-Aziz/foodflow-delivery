<script setup>
import { computed, onMounted, ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { driverApi } from '../../services/api.js';
import { useLiveUpdates } from '../../composables/useLiveUpdates.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';

const ui = useUiStore();
const router = useRouter();

const initialLoading = ref(true);
const busy = ref(null);
const expired = ref(new Set());
const now = ref(Date.now());

// Offers are time-critical: pushed live, and the fallback poll is faster than
// order status.
const polling = useLiveUpdates(async () => (await driverApi.offers()).data, {
  events: ['offer.created', 'offer.expired', 'offer.taken', 'offer.withdrawn'],
  intervalMs: Number(import.meta.env.VITE_OFFER_POLL_INTERVAL_MS ?? 5000),
  immediate: false,
});

let ticker = null;
onMounted(async () => {
  try {
    polling.data.value = (await driverApi.offers()).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    initialLoading.value = false;
  }
  polling.start();
  // Drives the countdown without refetching.
  ticker = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => clearInterval(ticker));

const offers = computed(() => polling.data.value ?? []);

const secondsLeft = (offer) =>
  Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - now.value) / 1000));

const isExpired = (offer) => secondsLeft(offer) <= 0 || expired.value.has(offer.id);

async function accept(offer) {
  busy.value = offer.id;
  try {
    await driverApi.acceptOffer(offer.id);
    ui.toastSuccess('Delivery accepted');
    router.push({ name: 'driver-delivery', params: { orderId: offer.order.id } });
  } catch (err) {
    // Losing the race is normal, not an error condition to alarm about.
    if (err.code === 'OFFER_NO_LONGER_AVAILABLE') {
      expired.value = new Set([...expired.value, offer.id]);
      ui.toast('That offer is no longer available');
    } else {
      ui.toastError(err.details?.[0]?.issue ?? err.message);
    }
    await polling.refresh();
  } finally {
    busy.value = null;
  }
}

async function decline(offer) {
  busy.value = offer.id;
  try {
    await driverApi.declineOffer(offer.id, 'Declined by driver');
    ui.toast('Offer declined');
    await polling.refresh();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Delivery offers') }}</h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ t('Offers expire automatically. You see the distance and area before accepting.') }}
    </p>

    <AppSpinner v-if="initialLoading" label="Loading offers" />

    <EmptyState v-else-if="offers.length === 0" class="mt-4"
                title="No offers right now"
                message="Stay online and new offers will appear here automatically." />

    <ul v-else class="mt-4 space-y-3">
      <li v-for="offer in offers" :key="offer.id" class="card p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-medium text-slate-900">{{ offer.order.restaurant.name }}</p>
            <p class="text-sm text-slate-600">
              {{ offer.order.orderNumber }} &middot; {{ t('{count} item(s)', { count: offer.order.itemCount }) }} &middot;
              {{ formatMoney(offer.order.totalAmount) }}
            </p>
            <p class="mt-1 text-sm text-slate-700">
              {{ t('Pick up: {address}', { address: offer.order.restaurant.addressLine1 }) }}
            </p>
            <!-- District only until accepted: the full address is not needed to
                 decide whether to take the job. -->
            <p class="text-sm text-slate-700">
              {{ t('Drop off: {area}', { area: offer.order.dropoff.district || offer.order.dropoff.city }) }}
              <span v-if="offer.distanceKm" class="text-slate-500">
                &middot; {{ t('{distance} km away', { distance: Number(offer.distanceKm).toFixed(1) }) }}
              </span>
            </p>
          </div>

          <div class="text-end">
            <p class="text-sm font-medium"
               :class="isExpired(offer) ? 'text-slate-500' : 'text-brand-700'"
               aria-live="polite">
              <template v-if="isExpired(offer)">{{ t('This offer expired') }}</template>
              <template v-else>{{ t('{seconds}s left', { seconds: secondsLeft(offer) }) }}</template>
            </p>

            <div class="mt-2 flex gap-2">
              <AppButton size="sm" variant="secondary" :disabled="busy === offer.id || isExpired(offer)"
                         @click="decline(offer)">
                {{ t('Decline') }}
              </AppButton>
              <AppButton size="sm" :loading="busy === offer.id" :disabled="isExpired(offer)"
                         @click="accept(offer)">
                {{ t('Accept') }}
              </AppButton>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
