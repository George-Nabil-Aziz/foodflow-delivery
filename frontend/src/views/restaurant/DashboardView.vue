<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { restaurantApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatMoney } from '../../utils/money.js';
import { UNAVAILABLE_REASON_LABEL } from '../../utils/orderStatus.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import AppButton from '../../components/shared/AppButton.vue';

const auth = useAuthStore();
const ui = useUiStore();

const profile = ref(null);
const stats = ref(null);
const loading = ref(true);
const toggling = ref(false);

async function load() {
  loading.value = true;
  try {
    profile.value = (await restaurantApi.profile()).data;
    auth.setSession({ restaurant: { ...profile.value } });
    // Statistics require an approved restaurant; a pending one simply has none.
    if (profile.value.status === 'ACTIVE') {
      stats.value = (await restaurantApi.stats()).data;
    }
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** Optimistic toggle with rollback: the switch must feel instant, but must not
 *  lie if the server refuses. */
async function toggleAccepting() {
  const previous = profile.value.isAcceptingOrders;
  profile.value.isAcceptingOrders = !previous;
  toggling.value = true;
  try {
    profile.value = (await restaurantApi.setAcceptingOrders(!previous)).data;
    ui.toastSuccess(profile.value.isAcceptingOrders
      ? 'You are accepting orders again'
      : 'Order intake paused');
  } catch (err) {
    profile.value.isAcceptingOrders = previous;
    ui.toastError(err.message);
  } finally {
    toggling.value = false;
  }
}
</script>

<template>
  <div>
    <AppSpinner v-if="loading" label="Loading dashboard" />

    <template v-else-if="profile">
      <h1 class="text-xl font-semibold text-slate-900">{{ profile.name }}</h1>

      <!-- The status banner states plainly what customers can and cannot see. -->
      <div class="card mt-4 p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="font-medium text-slate-900">
              <template v-if="profile.status === 'PENDING_APPROVAL'">{{ t('Awaiting approval') }}</template>
              <template v-else-if="profile.status === 'REJECTED'">{{ t('Application rejected') }}</template>
              <template v-else-if="profile.status === 'SUSPENDED'">{{ t('Suspended') }}</template>
              <template v-else-if="profile.isOrderable">{{ t('Open and accepting orders') }}</template>
              <template v-else>
                {{ t(UNAVAILABLE_REASON_LABEL[profile.unavailableReason] || 'Not accepting orders') }}
              </template>
            </p>
            <p class="mt-1 text-sm text-slate-600">
              <template v-if="profile.status === 'PENDING_APPROVAL'">
                {{ t('Customers cannot see you yet. Finish your profile, hours and menu while you wait.') }}
              </template>
              <template v-else-if="profile.status === 'REJECTED'">
                {{ profile.rejectionReason }}
              </template>
              <template v-else-if="profile.status === 'SUSPENDED'">
                {{ t('Contact FoodFlow support. Orders already in progress will still complete.') }}
              </template>
              <template v-else>
                {{ t('Customers can find you in search and place orders.') }}
              </template>
            </p>
          </div>

          <AppButton v-if="profile.status === 'ACTIVE'"
                     :variant="profile.isAcceptingOrders ? 'secondary' : 'primary'"
                     :loading="toggling" @click="toggleAccepting">
            {{ profile.isAcceptingOrders ? t('Pause new orders') : t('Resume taking orders') }}
          </AppButton>
        </div>
      </div>

      <dl v-if="stats" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Orders today') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">{{ stats.ordersToday }}</dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Awaiting your response') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">{{ stats.pendingOrders }}</dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Revenue today') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">{{ formatMoney(stats.revenueToday) }}</dd>
        </div>
        <div class="card stat-card p-4">
          <dt class="text-sm text-slate-600">{{ t('Rating') }}</dt>
          <dd class="mt-1 text-2xl font-semibold text-slate-900">
            <template v-if="stats.ratingCount">
              {{ Number(stats.ratingAverage).toFixed(2) }}
              <span class="text-base font-normal text-slate-500">({{ stats.ratingCount }})</span>
            </template>
            <template v-else><span class="text-base font-normal text-slate-500">{{ t('No ratings yet') }}</span></template>
          </dd>
        </div>
      </dl>

      <div class="mt-6 flex flex-wrap gap-3">
        <RouterLink v-if="profile.status === 'ACTIVE'" :to="{ name: 'restaurant-orders' }"
                    class="ui-control inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          {{ t('View orders') }}
        </RouterLink>
        <RouterLink v-if="profile.status === 'ACTIVE'" :to="{ name: 'restaurant-menu' }"
                    class="ui-control inline-flex items-center justify-center rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-50">
          {{ t('Manage menu') }}
        </RouterLink>
        <RouterLink :to="{ name: 'restaurant-profile' }"
                    class="ui-control inline-flex items-center justify-center rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-medium hover:bg-slate-50">
          {{ t('Edit profile') }}
        </RouterLink>
      </div>
    </template>
  </div>
</template>
