<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { driverApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import ErrorState from '../../components/shared/ErrorState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';

const route = useRoute();
const ui = useUiStore();

const delivery = ref(null);
const loading = ref(true);
const error = ref(null);
const busy = ref(false);

/** An enum as it has always read ("out of stock"), translated in Arabic. */
const enumText = (value) => t(value.replaceAll('_', ' ').toLowerCase());

async function load() {
  loading.value = true;
  error.value = null;
  try {
    delivery.value = (await driverApi.delivery(route.params.orderId)).data;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** One primary action at a time: the driver is on a phone, in traffic. */
const primaryAction = computed(() => {
  if (!delivery.value) return null;
  if (delivery.value.status === 'READY_FOR_PICKUP') {
    return { key: 'pickUp', label: 'I have picked up the order' };
  }
  if (delivery.value.status === 'OUT_FOR_DELIVERY') {
    return { key: 'deliver', label: 'Mark as delivered' };
  }
  return null;
});

const steps = computed(() => {
  const status = delivery.value?.status;
  return [
    { label: 'Head to the restaurant', done: ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(status), current: status === 'READY_FOR_PICKUP' },
    { label: 'Picked up', done: status === 'DELIVERED', current: status === 'OUT_FOR_DELIVERY' },
    { label: 'Delivered', done: status === 'DELIVERED', current: false },
  ];
});

async function act(key) {
  busy.value = true;
  try {
    delivery.value = (await driverApi[key](route.params.orderId)).data;
    ui.toastSuccess(key === 'pickUp' ? 'Marked as picked up' : 'Delivery complete');
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
    await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <AppSpinner v-if="loading" label="Loading delivery" />
    <ErrorState v-else-if="error" :message="error.message" @retry="load" />

    <template v-else-if="delivery">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h1 class="text-xl font-semibold text-slate-900">{{ delivery.orderNumber }}</h1>
        <StatusBadge :status="delivery.status" />
      </div>

      <!-- A cancelled delivery explains itself rather than showing an empty screen. -->
      <div v-if="delivery.status === 'CANCELLED'"
           class="card mt-4 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="status">
        {{ t('This order was cancelled') }}
        <template v-if="delivery.cancellationReason">
          ({{ enumText(delivery.cancellationReason) }})
        </template>.
        {{ t('You are available for new offers again.') }}
      </div>

      <ol class="card mt-4 space-y-3 p-4">
        <li v-for="step in steps" :key="step.label" class="flex items-center gap-3">
          <span class="h-3 w-3 shrink-0 rounded-full"
                :class="step.done ? 'bg-success' : step.current ? 'bg-primary' : 'bg-slate-300'"
                aria-hidden="true" />
          <span :class="step.done || step.current ? 'font-medium text-slate-900' : 'text-slate-500'">
            {{ t(step.label) }}
            <span v-if="step.current" class="sr-only">{{ t('(current step)') }}</span>
          </span>
        </li>
      </ol>

      <div v-if="primaryAction" class="mt-4">
        <AppButton size="lg" class="w-full" :loading="busy" @click="act(primaryAction.key)">
          {{ t(primaryAction.label) }}
        </AppButton>
      </div>

      <section class="card mt-4 p-4">
        <h2 class="font-semibold text-slate-900">{{ t('Pick up from') }}</h2>
        <p class="mt-1 text-slate-800">{{ delivery.pickup.restaurantName }}</p>
        <!-- Selectable so it can be pasted into a maps app. -->
        <p class="select-all text-slate-700">{{ delivery.pickup.addressLine1 }}</p>
        <a v-if="delivery.pickup.phone" :href="`tel:${delivery.pickup.phone}`"
           class="mt-1 inline-block text-brand-700 hover:underline">
          {{ delivery.pickup.phone }}
        </a>
      </section>

      <section class="card mt-4 p-4">
        <h2 class="font-semibold text-slate-900">{{ t('Deliver to') }}</h2>
        <p class="mt-1 text-slate-800">{{ delivery.dropoff.customerFirstName }}</p>
        <address class="select-all not-italic text-slate-700">
          {{ delivery.dropoff.line1 }}<template v-if="delivery.dropoff.line2">, {{ delivery.dropoff.line2 }}</template><br>
          <template v-if="delivery.dropoff.district">{{ delivery.dropoff.district }}, </template>
          {{ delivery.dropoff.city }}
        </address>
        <p class="mt-1 text-slate-700">{{ delivery.dropoff.customerPhone }}</p>
        <p v-if="delivery.customerNote" class="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
          {{ delivery.customerNote }}
        </p>
      </section>

      <section class="card mt-4 p-4">
        <h2 class="font-semibold text-slate-900">{{ t('Order contents') }}</h2>
        <ul class="mt-2 space-y-1 text-sm text-slate-700">
          <li v-for="(item, index) in delivery.items" :key="index">
            {{ item.quantity }} &times; {{ item.name }}
            <span v-if="item.notes" class="text-slate-500">({{ item.notes }})</span>
          </li>
        </ul>
        <p class="mt-3 font-semibold text-slate-900">
          {{ t('Collect {amount} in cash', { amount: formatMoney(delivery.totalAmount) }) }}
        </p>
      </section>

      <RouterLink :to="{ name: 'driver-dashboard' }"
                  class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
        {{ t('Back to dashboard') }}
      </RouterLink>
    </template>
  </div>
</template>
