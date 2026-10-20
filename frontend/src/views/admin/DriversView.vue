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
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import FilterBar from '../../components/shared/FilterBar.vue';
import PageTitle from '../../components/shared/PageTitle.vue';
import AccountStatusBadge from '../../components/shared/AccountStatusBadge.vue';
import { countEach } from '../../utils/countEach.js';
import FilterSearch from '../../components/shared/FilterSearch.vue';
import FilterSelect from '../../components/shared/FilterSelect.vue';
import { formatDateTime } from '../../utils/datetime.js';
import DeletedBadge from '../../components/shared/DeletedBadge.vue';
import DetailsDialog from '../../components/shared/DetailsDialog.vue';

const route = useRoute();
const ui = useUiStore();

// The dashboard links here with ?status=PENDING_APPROVAL, opening the
// approval queue's tab.
const tab = ref(route.query.status ?? '');
const search = ref('');
const drivers = ref([]);
const total = ref(0);
const counts = ref({});
const loading = ref(true);
const busy = ref(null);
const dialog = ref({ open: false, config: {}, driver: null, action: null });


const STATUSES = ['', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'DELETED'];

const statusOptions = computed(() => [
  { value: '', label: t('All drivers') },
  { value: 'PENDING_APPROVAL', label: t('Awaiting approval') },
  ...['ACTIVE', 'SUSPENDED'].map((s) => ({ value: s, label: enumText(s) })),
  { value: 'DELETED', label: t('Deleted') },
].map((o) => ({ ...o, count: counts.value[o.value] })));

/** One choice's query, shared by the list and its count. */
function paramsFor(status, limit) {
  const params = { limit };
  if (status === 'DELETED') params.deleted = 'only';
  else if (status) params.status = status;
  if (search.value.trim().length >= 1) params.q = search.value.trim();
  return params;
}

async function load() {
  loading.value = true;
  try {
    const [list, totals] = await Promise.all([
      adminApi.drivers(paramsFor(tab.value, 50)),
      countEach(STATUSES, (status) => adminApi.drivers(paramsFor(status, 1))),
    ]);
    drivers.value = list.data;
    total.value = list.meta.pagination?.total ?? list.data.length;
    counts.value = totals;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function approve(driver) {
  busy.value = driver.userId;
  try {
    await adminApi.approveDriver(driver.userId);
    ui.toastSuccess(t('{name} approved', { name: driver.fullName }));
    await load();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

function askSuspend(driver) {
  dialog.value = {
    open: true,
    driver,
    action: 'suspend',
    config: {
      title: t('Suspend {name}?', { name: driver.fullName }),
      message: 'A driver who is currently on a delivery cannot be suspended: the order is already in their vehicle.',
      confirmLabel: 'Suspend driver',
      requireReason: true,
      variant: 'danger',
    },
  };
}

function askDelete(driver) {
  dialog.value = {
    open: true,
    driver,
    action: 'delete',
    config: {
      title: t('Delete {name}?', { name: driver.fullName }),
      message: 'They will no longer be able to sign in until restored. Their past orders and reviews are kept.',
      confirmLabel: 'Delete driver',
      requireReason: true,
      variant: 'danger',
    },
  };
}

async function confirmAction({ reason }) {
  const { driver, action } = dialog.value;
  dialog.value = { ...dialog.value, open: false };
  busy.value = driver.userId;
  try {
    if (action === 'suspend') {
      await adminApi.suspendDriver(driver.userId, reason);
      ui.toastSuccess('Driver suspended');
    } else {
      await adminApi.deleteDriver(driver.userId, reason);
      ui.toastSuccess(t('{name} deleted', { name: driver.fullName }));
    }
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

const details = ref({ open: false, driver: null });

const ratingText = (d) => (d.ratingCount
  ? `${Number(d.ratingAverage).toFixed(2)} (${d.ratingCount})`
  : capitalize(t('unrated')));

const detailFields = computed(() => {
  const d = details.value.driver;
  if (!d) return [];
  return [
    { label: t('Name'), value: d.fullName },
    { label: t('Email'), value: d.email },
    { label: t('Phone'), value: d.phone },
    { label: t('Status'), value: d.deletedAt ? t('Deleted') : enumText(d.status) },
    { label: t('Availability'), value: d.availability && enumText(d.availability) },
    { label: t('Vehicle'), value: [d.vehicleType && enumText(d.vehicleType), d.vehiclePlate].filter(Boolean).join(' · ') },
    { label: t('Rating'), value: ratingText(d) },
    { label: t('Joined'), value: formatDateTime(d.createdAt) },
    ...(d.deletedAt ? [{ label: t('Deleted on'), value: formatDateTime(d.deletedAt) }] : []),
  ];
});

async function restore(driver) {
  busy.value = driver.userId;
  try {
    await adminApi.restoreDriver(driver.userId);
    ui.toastSuccess(t('{name} restored', { name: driver.fullName }));
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <section class="min-w-0">
      <PageTitle :title="t('Drivers')" :count="loading ? null : total" />

      <FilterBar :add-to="{ name: 'admin-driver-new' }" :add-label="t('Add a driver')">
        <FilterSearch id="d-search" v-model="search" :placeholder="t('Search by name or email')" @update:model-value="load" />
        <FilterSelect id="d-status" :model-value="tab" :label="t('Status')" :options="statusOptions"
                      @update:model-value="(v) => { tab = v; load(); }" />
      </FilterBar>

      <AppSpinner v-if="loading" label="Loading drivers" />

      <template v-else-if="tab !== 'PENDING_APPROVAL'">
        <EmptyState v-if="drivers.length === 0" class="mt-4" title="No drivers match this filter" />

        <div v-else class="card table-wrap mt-4 overflow-x-auto">
          <table class="table-cards w-full text-start text-sm">
            <thead class="border-b border-slate-200 text-slate-600">
              <tr>
                <th scope="col" class="p-3">{{ t('Driver') }}</th>
                <th scope="col" class="p-3">{{ t('Status') }}</th>
                <th scope="col" class="p-3">{{ t('Availability') }}</th>
                <th scope="col" class="p-3">{{ t('Rating') }}</th>
                <th scope="col" class="p-3">{{ t('Joined') }}</th>
                <th scope="col" class="p-3">{{ t('Actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in drivers" :key="d.id" class="border-b border-slate-100 last:border-0">
                <td :data-label="t('Driver')" class="p-3">
                  <button type="button" class="details-link" @click="details = { open: true, driver: d }">{{ d.fullName }}</button>
                  <span class="block text-xs text-slate-500">{{ d.email }}</span>
                </td>
                <td :data-label="t('Status')" class="p-3">
                  <DeletedBadge v-if="d.deletedAt" />
                  <AccountStatusBadge v-else :status="d.status" />
                </td>
                <td :data-label="t('Availability')" class="p-3">{{ enumText(d.availability) }}</td>
                <td :data-label="t('Rating')" class="p-3">
                  <span :class="{ 'text-slate-500': !d.ratingCount }">{{ ratingText(d) }}</span>
                </td>
                <td :data-label="t('Joined')" class="p-3 text-slate-600">{{ formatDateTime(d.createdAt) }}</td>
                <td :data-label="t('Actions')" class="p-3">
                  <button v-if="d.deletedAt" type="button" :disabled="busy === d.userId"
                          class="action-link text-brand-700 hover:underline" @click="restore(d)">
                    {{ t('Restore') }}
                  </button>
                  <span v-else class="flex flex-wrap gap-x-4 gap-y-2">
                    <button v-if="d.status === 'ACTIVE'" type="button" :disabled="busy === d.userId"
                            class="action-link text-red-700 hover:underline" @click="askSuspend(d)">
                      {{ t('Suspend') }}
                    </button>
                    <button v-else-if="d.status === 'PENDING_APPROVAL'" type="button"
                            :disabled="busy === d.userId" class="action-link text-brand-700 hover:underline"
                            @click="approve(d)">
                      {{ t('Approve') }}
                    </button>
                    <button type="button" :disabled="busy === d.userId"
                            class="action-link action-delete text-red-700 hover:underline" @click="askDelete(d)">
                      {{ t('Delete') }}
                    </button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else>
        <EmptyState v-if="drivers.length === 0" class="mt-4" title="No drivers are awaiting approval" />
        <ul v-else class="mt-4 space-y-2">
          <li v-for="d in drivers" :key="d.id" class="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div class="min-w-0">
              <p class="font-medium text-slate-900">{{ d.fullName }}</p>
              <p class="break-words text-sm text-slate-600">{{ d.email }} &middot; {{ enumText(d.vehicleType) }} {{ d.vehiclePlate }}</p>
            </div>
            <AppButton size="sm" :disabled="busy === d.userId" @click="approve(d)">{{ t('Approve') }}</AppButton>
          </li>
        </ul>
      </template>
    </section>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmAction" @cancel="dialog.open = false" />
    <DetailsDialog :open="details.open" :title="details.driver?.fullName ?? ''"
                   :fields="detailFields" @close="details.open = false" />
  </div>
</template>
