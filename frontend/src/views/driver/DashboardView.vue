<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { driverApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import AppButton from '../../components/shared/AppButton.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import StatusBadge from '../../components/shared/StatusBadge.vue';

const auth = useAuthStore();
const ui = useUiStore();

const profile = ref(null);
const active = ref([]);
const loading = ref(true);
const toggling = ref(false);

/** An enum as it has always read ("pending approval"), translated in Arabic. */
const enumText = (value) => t(value.replaceAll('_', ' ').toLowerCase());

async function load() {
  loading.value = true;
  try {
    profile.value = (await driverApi.profile()).data;
    auth.setSession({ driverProfile: profile.value });
    if (profile.value.status === 'ACTIVE') {
      active.value = (await driverApi.deliveries({ scope: 'active' })).data;
    }
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const onDelivery = computed(() => profile.value?.availability === 'ON_DELIVERY');
const isOnline = computed(() => profile.value?.availability === 'AVAILABLE');

/**
 * Going offline mid-delivery is refused by the server; surfacing that as a
 * readable message is better than a silent failure.
 */
async function toggleAvailability() {
  toggling.value = true;
  try {
    const next = isOnline.value ? 'OFFLINE' : 'AVAILABLE';
    profile.value = (await driverApi.setAvailability(next)).data;
    auth.setSession({ driverProfile: profile.value });
    ui.toastSuccess(next === 'AVAILABLE' ? 'You are online' : 'You are offline');
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
    await load();
  } finally {
    toggling.value = false;
  }
}
</script>

<template>
  <div>
    <AppSpinner v-if="loading" label="Loading dashboard" />

    <template v-else-if="profile">
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Driver dashboard') }}</h1>

      <div class="card mt-4 p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="font-medium text-slate-900">
              <template v-if="profile.status !== 'ACTIVE'">
                {{ t('Account {status}', { status: enumText(profile.status) }) }}
              </template>
              <template v-else-if="onDelivery">{{ t('On a delivery') }}</template>
              <template v-else-if="isOnline">{{ t('Online and available') }}</template>
              <template v-else>{{ t('Offline') }}</template>
            </p>
            <p class="mt-1 text-sm text-slate-600">
              <template v-if="profile.status === 'PENDING_APPROVAL'">
                {{ t('An administrator must approve your account before you can take deliveries.') }}
              </template>
              <template v-else-if="onDelivery">
                {{ t('Finish your current delivery before going offline.') }}
              </template>
              <template v-else-if="isOnline">{{ t('You will receive delivery offers.') }}</template>
              <template v-else>{{ t('Go online to start receiving offers.') }}</template>
            </p>
          </div>

          <AppButton v-if="profile.status === 'ACTIVE'"
                     :variant="isOnline ? 'secondary' : 'primary'"
                     :loading="toggling" :disabled="onDelivery"
                     :aria-label="onDelivery
                       ? t('You cannot go offline during an active delivery')
                       : isOnline ? t('Go offline') : t('Go online')"
                     @click="toggleAvailability">
            {{ isOnline ? t('Go offline') : t('Go online') }}
          </AppButton>
        </div>

        <p v-if="onDelivery" class="mt-3 text-sm text-slate-700">
          {{ t('You cannot go offline while a delivery is in progress.') }}
        </p>
      </div>

      <dl v-if="profile.status === 'ACTIVE'" class="mt-6 grid gap-4 sm:grid-cols-3">
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Active deliveries') }}</dt>
          <dd class="mt-1 text-2xl font-semibold">{{ active.length }}</dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Rating') }}</dt>
          <dd class="mt-1 text-2xl font-semibold">
            <template v-if="profile.ratingCount">
              {{ Number(profile.ratingAverage).toFixed(2) }}
              <span class="text-base font-normal text-slate-500">({{ profile.ratingCount }})</span>
            </template>
            <template v-else><span class="text-base font-normal text-slate-500">{{ t('No ratings yet') }}</span></template>
          </dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Vehicle') }}</dt>
          <dd class="mt-1 text-lg font-semibold">
            {{ enumText(profile.vehicleType) }}
            <span class="text-sm font-normal text-slate-500">{{ profile.vehiclePlate }}</span>
          </dd>
        </div>
      </dl>

      <section v-if="profile.status === 'ACTIVE'" class="mt-6">
        <h2 class="text-lg font-semibold text-slate-900">{{ t('Current delivery') }}</h2>

        <EmptyState v-if="active.length === 0" class="mt-3"
                    title="No active delivery"
                    message="Accept an offer to start delivering.">
          <RouterLink :to="{ name: 'driver-offers' }" class="action-link text-brand-700 hover:underline">
            {{ t('See available offers') }}
          </RouterLink>
        </EmptyState>

        <ul v-else class="mt-3 space-y-3">
          <li v-for="delivery in active" :key="delivery.id">
            <RouterLink :to="{ name: 'driver-delivery', params: { orderId: delivery.id } }"
                        class="card block p-4 hover:shadow-md">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-medium text-slate-900">{{ delivery.orderNumber }}</p>
                  <p class="text-sm text-slate-600">
                    {{ delivery.restaurantName }} <span class="inline-block rtl:rotate-180">&rarr;</span> {{ delivery.district }}
                  </p>
                </div>
                <div class="text-end">
                  <StatusBadge :status="delivery.status" />
                  <p class="mt-1 font-semibold">{{ formatMoney(delivery.totalAmount) }}</p>
                </div>
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
