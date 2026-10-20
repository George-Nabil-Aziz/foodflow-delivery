<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

const ui = useUiStore();
const stats = ref(null);
const stuck = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    stats.value = (await adminApi.stats()).data;
    stuck.value = (await adminApi.stuck().catch(() => ({ data: [] }))).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
});

/** Everything waiting on an admin, each linking straight to where it is handled. */
const items = computed(() => {
  if (!stats.value) return [];
  return [
    {
      key: 'restaurants',
      count: stats.value.accounts.pendingRestaurants,
      label: t('Restaurants awaiting approval'),
      to: { name: 'admin-restaurants', query: { status: 'PENDING_APPROVAL' } },
    },
    {
      key: 'drivers',
      count: stats.value.accounts.pendingDrivers,
      label: t('Drivers awaiting approval'),
      to: { name: 'admin-drivers', query: { status: 'PENDING_APPROVAL' } },
    },
    {
      key: 'unassigned',
      count: stats.value.unassignedBacklog,
      label: t('Orders waiting for a driver'),
      to: { name: 'admin-orders', query: { view: 'unassigned' } },
    },
    {
      key: 'stuck',
      count: stuck.value.length,
      label: t('Orders stuck'),
      to: { name: 'admin-orders', query: { view: 'stuck' } },
    },
  ].filter((item) => item.count > 0);
});
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Needs attention') }}</h1>

    <AppSpinner v-if="loading" label="Loading" />

    <EmptyState v-else-if="items.length === 0" class="mt-4" title="Nothing needs attention right now" />

    <ul v-else class="mt-4 space-y-3" role="status">
      <li v-for="item in items" :key="item.key">
        <RouterLink :to="item.to"
                    class="card flex items-center gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 transition hover:border-amber-400">
          <!-- What it is first; how many sits beside it. -->
          <span class="font-medium">{{ item.label }}</span>
          <span class="ms-auto rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white">{{ item.count }}</span>
          <svg class="h-4 w-4 shrink-0 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </RouterLink>
      </li>
    </ul>

    <RouterLink :to="{ name: 'admin-dashboard' }" class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
      {{ t('Back to dashboard') }}
    </RouterLink>
  </div>
</template>
