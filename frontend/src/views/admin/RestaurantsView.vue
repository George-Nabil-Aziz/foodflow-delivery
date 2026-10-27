<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { t } from '../../i18n/index.js';
import { capitalize, enumText } from '../../utils/labels.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import FilterBar from '../../components/shared/FilterBar.vue';
import PageTitle from '../../components/shared/PageTitle.vue';
import FilterSearch from '../../components/shared/FilterSearch.vue';
import FilterSelect from '../../components/shared/FilterSelect.vue';
import { formatDateTime } from '../../utils/datetime.js';
import DeletedBadge from '../../components/shared/DeletedBadge.vue';
import AccountStatusBadge from '../../components/shared/AccountStatusBadge.vue';
import { countEach } from '../../utils/countEach.js';
import DetailsDialog from '../../components/shared/DetailsDialog.vue';

const route = useRoute();
const ui = useUiStore();

const restaurants = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const pageSize = ref(20);
const loading = ref(true);
const busy = ref(null);
const statusFilter = ref(route.query.status ?? '');
const search = ref('');
const counts = ref({});
const dialog = ref({ open: false, config: {}, restaurant: null, action: null });


const STATUSES = ['', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'DELETED'];

const statusOptions = computed(() => [
  { value: '', label: t('All restaurants') },
  { value: 'PENDING_APPROVAL', label: t('Awaiting approval') },
  ...['ACTIVE', 'SUSPENDED', 'REJECTED'].map((s) => ({ value: s, label: enumText(s) })),
  { value: 'DELETED', label: t('Deleted') },
].map((o) => ({ ...o, count: counts.value[o.value] })));

/** One choice's query, shared by the list and its count. */
function paramsFor(status, page, limit) {
  const params = { page, limit };
  if (status === 'DELETED') params.deleted = 'only';
  else if (status) params.status = status;
  if (search.value.trim().length >= 1) params.q = search.value.trim();
  return params;
}

async function load(page = 1) {
  loading.value = true;
  try {
    const [res, totals] = await Promise.all([
      adminApi.restaurants(paramsFor(statusFilter.value, page, pageSize.value)),
      countEach(STATUSES, (status) => adminApi.restaurants(paramsFor(status, 1, 1))),
    ]);
    restaurants.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
    counts.value = totals;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());

const details = ref({ open: false, restaurant: null });

const ratingText = (r) => (r.ratingCount
  ? `${Number(r.ratingAverage).toFixed(2)} (${r.ratingCount})`
  : capitalize(t('unrated')));

const detailFields = computed(() => {
  const r = details.value.restaurant;
  if (!r) return [];
  return [
    { label: t('Name'), value: r.name },
    { label: t('Status'), value: r.deletedAt ? t('Deleted') : enumText(r.status) },
    ...(r.rejectionReason ? [{ label: t('Rejection reason'), value: r.rejectionReason }] : []),
    { label: t('Cuisine'), value: r.cuisineType && enumText(r.cuisineType) },
    { label: t('City'), value: r.city },
    { label: t('Delivery radius'), value: r.deliveryRadiusKm != null ? t('{n} km', { n: Number(r.deliveryRadiusKm) }) : null },
    { label: t('Accepting orders'), value: r.isAcceptingOrders ? t('Yes') : t('No') },
    { label: t('Available items'), value: r.availableItemCount },
    { label: t('Rating'), value: ratingText(r) },
    { label: t('Owner'), value: r.owner?.fullName },
    { label: t('Owner email'), value: r.owner?.email },
    { label: t('Joined'), value: formatDateTime(r.owner?.createdAt) },
    { label: t('Approved on'), value: formatDateTime(r.approvedAt) },
    ...(r.deletedAt ? [{ label: t('Deleted on'), value: formatDateTime(r.deletedAt) }] : []),
  ];
});

function setTab(next) {
  statusFilter.value = next;
  load(1);
}

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
    if (action === 'delete') await adminApi.deleteRestaurant(restaurant.id, reason);
    ui.toastSuccess(action === 'delete' ? t('{name} deleted', { name: restaurant.name }) : 'Restaurant updated');
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

async function restore(restaurant) {
  busy.value = restaurant.id;
  try {
    await adminApi.restoreRestaurant(restaurant.id);
    ui.toastSuccess(t('{name} restored', { name: restaurant.name }));
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <PageTitle :title="t('Restaurants')" :count="loading ? null : pagination.total" />

    <FilterBar :add-to="{ name: 'admin-restaurant-new' }" :add-label="t('Add a restaurant')">
      <FilterSearch id="r-search" v-model="search" :placeholder="t('Search by restaurant name')" @update:model-value="load(1)" />
      <FilterSelect id="r-status" :model-value="statusFilter" :label="t('Status')" :options="statusOptions"
                    @update:model-value="setTab" />
    </FilterBar>

    <AppSpinner v-if="loading" label="Loading restaurants" />
    <EmptyState v-else-if="restaurants.length === 0" class="mt-4" title="No restaurants match this filter" />

    <template v-else>
      <!-- The approval queue: each application with what decides it. -->
      <section v-if="statusFilter === 'PENDING_APPROVAL'" class="mt-4">
        <ul class="space-y-3">
          <li v-for="r in restaurants" :key="r.id" class="card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-medium text-slate-900">{{ r.name }}</p>
                <p class="text-sm text-slate-600">
                  {{ enumText(r.cuisineType) }} &middot; {{ r.city || capitalize(t('no city set')) }} &middot;
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

      <section v-else class="mt-4">
        <div class="card table-wrap overflow-x-auto">
          <table class="table-cards w-full text-start text-sm">
            <thead class="border-b border-slate-200 text-slate-600">
              <tr>
                <th scope="col" class="p-3">{{ t('Name') }}</th>
                <th scope="col" class="p-3">{{ t('Status') }}</th>
                <th scope="col" class="p-3">{{ t('Items') }}</th>
                <th scope="col" class="p-3">{{ t('Rating') }}</th>
                <th scope="col" class="p-3">{{ t('Joined') }}</th>
                <th scope="col" class="p-3">{{ t('Actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in restaurants" :key="r.id" class="border-b border-slate-100 last:border-0">
                <td :data-label="t('Name')" class="p-3">
                  <button type="button" class="details-link" @click="details = { open: true, restaurant: r }">{{ r.name }}</button>
                  <span class="block text-xs text-slate-500">{{ r.owner.email }}</span>
                </td>
                <td :data-label="t('Status')" class="p-3">
                  <DeletedBadge v-if="r.deletedAt" />
                  <template v-else>
                    <AccountStatusBadge :status="r.status" />
                    <span v-if="r.rejectionReason" class="block text-xs text-slate-500">
                      {{ r.rejectionReason }}
                    </span>
                  </template>
                </td>
                <td :data-label="t('Items')" class="p-3">{{ r.availableItemCount }}</td>
                <td :data-label="t('Rating')" class="p-3">
                  <span :class="{ 'text-slate-500': !r.ratingCount }">{{ ratingText(r) }}</span>
                </td>
                <td :data-label="t('Joined')" class="p-3 text-slate-600">{{ formatDateTime(r.owner.createdAt) }}</td>
                <td :data-label="t('Actions')" class="p-3">
                  <button v-if="r.deletedAt" type="button" :disabled="busy === r.id"
                          class="action-link text-brand-700 hover:underline" @click="restore(r)">
                    {{ t('Restore') }}
                  </button>
                  <span v-else class="flex flex-wrap gap-x-4 gap-y-2">
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
                    <!-- Approving needs the application's details, which live on the queue tab. -->
                    <button v-else-if="r.status === 'PENDING_APPROVAL'" type="button"
                            class="action-link text-brand-700 hover:underline" @click="setTab('PENDING_APPROVAL')">
                      {{ t('Review') }}
                    </button>
                    <button v-else type="button" :disabled="busy === r.id"
                            class="action-link text-brand-700 hover:underline" @click="reactivate(r)">
                      {{ t('Reactivate') }}
                    </button>
                    <button type="button" :disabled="busy === r.id"
                            class="action-link action-delete text-red-700 hover:underline"
                            @click="ask(r, 'delete', {
                              title: t('Delete {name}?', { name: r.name }),
                              message: 'The restaurant disappears from customers, and the owner’s account is deleted with it. Past orders and reviews are kept, and both can be restored.',
                              confirmLabel: 'Delete restaurant',
                              requireReason: true,
                              variant: 'danger',
                            })">
                      {{ t('Delete') }}
                    </button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppPagination :pagination="pagination" :limit="pageSize" @change="load"
          @update:limit="(n) => { pageSize = n; load(1); }" />
      </section>
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmAction" @cancel="dialog.open = false" />
    <DetailsDialog :open="details.open" :title="details.restaurant?.name ?? ''"
                   :fields="detailFields" @close="details.open = false" />
  </div>
</template>
