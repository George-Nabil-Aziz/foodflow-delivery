<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const route = useRoute();
const ui = useUiStore();

const restaurants = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const loading = ref(true);
const busy = ref(null);
const statusFilter = ref(route.query.status ?? '');
const dialog = ref({ open: false, config: {}, restaurant: null, action: null });

/** An enum as it has always read ("pending approval"), translated in Arabic. */
const enumText = (value) => t(value.replaceAll('_', ' ').toLowerCase());

async function load(page = 1) {
  loading.value = true;
  try {
    const params = { page, limit: 20 };
    if (statusFilter.value) params.status = statusFilter.value;
    const res = await adminApi.restaurants(params);
    restaurants.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());

const pending = computed(() => restaurants.value.filter((r) => r.status === 'PENDING_APPROVAL'));
const others = computed(() => restaurants.value.filter((r) => r.status !== 'PENDING_APPROVAL'));

async function approve(restaurant) {
  busy.value = restaurant.id;
  try {
    await adminApi.approveRestaurant(restaurant.id);
    ui.toastSuccess(t('{name} approved and now visible to customers', { name: restaurant.name }));
    await load(pagination.value.page);
  } catch (err) {
    // The "no available items" rule is explained rather than shown as a code.
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

function ask(restaurant, action, config) {
  dialog.value = { open: true, restaurant, action, config };
}

async function confirmAction({ reason }) {
  const { restaurant, action } = dialog.value;
  dialog.value = { ...dialog.value, open: false };
  busy.value = restaurant.id;
  try {
    if (action === 'reject') await adminApi.rejectRestaurant(restaurant.id, reason);
    if (action === 'suspend') await adminApi.suspendRestaurant(restaurant.id, reason);
    ui.toastSuccess('Restaurant updated');
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

async function reactivate(restaurant) {
  busy.value = restaurant.id;
  try {
    await adminApi.reactivateRestaurant(restaurant.id);
    ui.toastSuccess('Restaurant reactivated');
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Restaurants') }}</h1>

    <div class="card mt-4 p-4 sm:max-w-xs">
      <label for="r-status" class="field-label">{{ t('Status') }}</label>
      <select id="r-status" v-model="statusFilter" class="field-input" @change="load(1)">
        <option value="">{{ t('All statuses') }}</option>
        <option v-for="s in ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED']" :key="s" :value="s">
          {{ enumText(s) }}
        </option>
      </select>
    </div>

    <AppSpinner v-if="loading" label="Loading restaurants" />
    <EmptyState v-else-if="restaurants.length === 0" class="mt-4" title="No restaurants match this filter" />

    <template v-else>
      <!-- The approval queue comes first: it is the daily job. -->
      <section v-if="pending.length" class="mt-6">
        <h2 class="text-lg font-semibold text-slate-900">{{ t('Awaiting approval ({count})', { count: pending.length }) }}</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="r in pending" :key="r.id" class="card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-medium text-slate-900">{{ r.name }}</p>
                <p class="text-sm text-slate-600">
                  {{ enumText(r.cuisineType) }} &middot; {{ r.city || t('no city set') }} &middot;
                  {{ t('{count} available item(s)', { count: r.availableItemCount }) }}
                </p>
                <p class="text-sm text-slate-600">
                  {{ t('Owner: {name} ({email})', { name: r.owner.fullName, email: r.owner.email }) }}
                </p>
                <p v-if="r.availableItemCount === 0" class="mt-1 text-sm text-amber-800">
                  {{ t('Cannot be approved yet: a restaurant needs at least one available item.') }}
                </p>
              </div>
              <div class="flex shrink-0 gap-2">
                <AppButton size="sm" :disabled="busy === r.id || r.availableItemCount === 0"
                           @click="approve(r)">
{{ t('Approve') }}
</AppButton>
                <AppButton size="sm" variant="danger" :disabled="busy === r.id"
                           @click="ask(r, 'reject', {
                             title: t('Reject {name}?', { name: r.name }),
                             message: 'The owner will see your reason and can fix the problem and resubmit.',
                             confirmLabel: 'Reject application',
                             requireReason: true,
                             variant: 'danger',
                           })">
{{ t('Reject') }}
</AppButton>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section class="mt-6">
        <h2 class="text-lg font-semibold text-slate-900">{{ t('All restaurants') }}</h2>
        <div class="card table-wrap mt-3 overflow-x-auto">
          <table class="table-cards w-full text-start text-sm">
            <thead class="border-b border-slate-200 text-slate-600">
              <tr>
                <th scope="col" class="p-3">{{ t('Name') }}</th>
                <th scope="col" class="p-3">{{ t('Status') }}</th>
                <th scope="col" class="p-3">{{ t('Items') }}</th>
                <th scope="col" class="p-3">{{ t('Rating') }}</th>
                <th scope="col" class="p-3">{{ t('Actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in others" :key="r.id" class="border-b border-slate-100 last:border-0">
                <td :data-label="t('Name')" class="p-3">
                  <span class="font-medium text-slate-900">{{ r.name }}</span>
                  <span class="block text-xs text-slate-500">{{ r.owner.email }}</span>
                </td>
                <td :data-label="t('Status')" class="p-3">
                  {{ enumText(r.status) }}
                  <span v-if="r.rejectionReason" class="block text-xs text-slate-500">
                    {{ r.rejectionReason }}
                  </span>
                </td>
                <td :data-label="t('Items')" class="p-3">{{ r.availableItemCount }}</td>
                <td :data-label="t('Rating')" class="p-3">
                  <template v-if="r.ratingCount">
                    {{ Number(r.ratingAverage).toFixed(2) }} ({{ r.ratingCount }})
                  </template>
                  <template v-else><span class="text-slate-500">{{ t('unrated') }}</span></template>
                </td>
                <td :data-label="t('Actions')" class="p-3">
                  <button v-if="r.status === 'ACTIVE'" type="button" :disabled="busy === r.id"
                          class="action-link text-red-700 hover:underline"
                          @click="ask(r, 'suspend', {
                            title: t('Suspend {name}?', { name: r.name }),
                            message: 'The restaurant disappears from customer listings immediately. Orders already in progress will still complete.',
                            confirmLabel: 'Suspend restaurant',
                            requireReason: true,
                            variant: 'danger',
                          })">
                    {{ t('Suspend') }}
                  </button>
                  <button v-else type="button" :disabled="busy === r.id"
                          class="action-link text-brand-700 hover:underline" @click="reactivate(r)">
                    {{ t('Reactivate') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppPagination :pagination="pagination" @change="load" />
      </section>
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmAction" @cancel="dialog.open = false" />
  </div>
</template>
