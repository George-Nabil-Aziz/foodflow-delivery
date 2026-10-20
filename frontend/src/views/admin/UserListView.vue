<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { adminApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatDateTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import { rawEnumText } from '../../utils/labels.js';
import { countEach } from '../../utils/countEach.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import DeletedBadge from '../../components/shared/DeletedBadge.vue';
import FilterBar from '../../components/shared/FilterBar.vue';
import PageTitle from '../../components/shared/PageTitle.vue';
import FilterSearch from '../../components/shared/FilterSearch.vue';
import FilterSelect from '../../components/shared/FilterSelect.vue';
import DetailsDialog from '../../components/shared/DetailsDialog.vue';

/**
 * One account list per role: Customers and Admins in the sidebar. Restaurant
 * owners and drivers are managed from their own pages, where their orders and
 * deliveries decide what an admin may do.
 */
const props = defineProps({ role: { type: String, required: true } }); // 'CUSTOMER' | 'ADMIN'

const COPY = {
  CUSTOMER: { title: 'Customers', add: 'Add a customer', addRoute: 'admin-customer-new', loading: 'Loading customers', empty: 'No customers match these filters' },
  ADMIN: { title: 'Admins', add: 'Add an admin', addRoute: 'admin-admin-new', loading: 'Loading admins', empty: 'No admins match these filters' },
};

const auth = useAuthStore();
const ui = useUiStore();

const users = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const pageSize = ref(20);
const loading = ref(true);
const busy = ref(null);
// status: '' | 'ACTIVE' | 'SUSPENDED' | 'DELETED'
const filters = ref({ status: '', q: '' });
const dialog = ref({ open: false, config: {}, user: null, action: null });

const STATUSES = ['', 'ACTIVE', 'SUSPENDED', 'DELETED'];
const counts = ref({});

/** One choice's query, shared by the list and its count. */
function paramsFor(status, page, limit) {
  const params = { page, limit, role: props.role };
  if (status === 'DELETED') params.deleted = 'only';
  else if (status) params.status = status;
  if (filters.value.q.trim().length >= 1) params.q = filters.value.q.trim();
  return params;
}

const statusOptions = computed(() => [
  { value: '', label: t('All statuses') },
  { value: 'ACTIVE', label: t('Active', null, 'status') },
  { value: 'SUSPENDED', label: t('Suspended') },
  { value: 'DELETED', label: t('Deleted') },
].map((o) => ({ ...o, count: counts.value[o.value] })));

async function load(page = 1) {
  loading.value = true;
  try {
    const [res, totals] = await Promise.all([
      adminApi.users(paramsFor(filters.value.status, page, pageSize.value)),
      countEach(STATUSES, (status) => adminApi.users(paramsFor(status, 1, 1))),
    ]);
    users.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
    counts.value = totals;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
// Customers -> Admins reuses this instance; start the new list from scratch.
watch(() => props.role, () => { filters.value = { status: '', q: '' }; load(1); });

/** Destructive actions name their target and require a reason. */
function askSuspend(user) {
  dialog.value = {
    open: true,
    user,
    action: 'suspend',
    config: {
      title: t('Suspend {name}?', { name: user.fullName }),
      message: t('This immediately ends every session for {email} and blocks their existing access token. They will not be able to sign in until reactivated.', { email: user.email }),
      confirmLabel: 'Suspend account',
      requireReason: true,
      variant: 'danger',
    },
  };
}

function askDelete(user) {
  dialog.value = {
    open: true,
    user,
    action: 'delete',
    config: {
      title: t('Delete {name}?', { name: user.fullName }),
      message: 'They will no longer be able to sign in until restored. Their past orders and reviews are kept.',
      confirmLabel: 'Delete account',
      requireReason: true,
      variant: 'danger',
    },
  };
}

async function confirmAction({ reason }) {
  const { user, action } = dialog.value;
  dialog.value = { ...dialog.value, open: false };
  busy.value = user.id;
  try {
    if (action === 'suspend') {
      await adminApi.suspendUser(user.id, reason);
      ui.toastSuccess(t('{name} suspended', { name: user.fullName }));
    } else {
      await adminApi.deleteUser(user.id, reason);
      ui.toastSuccess(t('{name} deleted', { name: user.fullName }));
    }
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

const details = ref({ open: false, loading: false, user: null, orderCount: null });

/** Everything about one account. A customer's order count needs one more call. */
async function openDetails(user) {
  const isCustomer = props.role === 'CUSTOMER';
  details.value = { open: true, loading: isCustomer, user, orderCount: null };
  if (!isCustomer) return;
  try {
    const res = await adminApi.user(user.id);
    details.value.orderCount = res.data.activity?.orderCount ?? null;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    details.value.loading = false;
  }
}

const detailFields = computed(() => {
  const user = details.value.user;
  if (!user) return [];
  return [
    { label: t('Name'), value: user.fullName },
    { label: t('Email'), value: user.email },
    { label: t('Phone'), value: user.phone },
    { label: t('Role'), value: rawEnumText(user.role) },
    { label: t('Status'), value: user.deletedAt ? t('Deleted') : rawEnumText(user.status) },
    ...(props.role === 'CUSTOMER' ? [{ label: t('Orders'), value: details.value.orderCount }] : []),
    { label: t('Joined'), value: formatDateTime(user.createdAt) },
    { label: t('Last sign-in'), value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('Never') },
    ...(user.deletedAt ? [{ label: t('Deleted on'), value: formatDateTime(user.deletedAt) }] : []),
  ];
});

async function reactivate(user) {
  busy.value = user.id;
  try {
    await adminApi.reactivateUser(user.id, 'Reactivated by administrator');
    ui.toastSuccess(t('{name} reactivated', { name: user.fullName }));
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

async function restore(user) {
  busy.value = user.id;
  try {
    await adminApi.restoreUser(user.id);
    ui.toastSuccess(t('{name} restored', { name: user.fullName }));
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
    <PageTitle :title="t(COPY[role].title)" :count="loading ? null : pagination.total" />

    <FilterBar :add-to="{ name: COPY[role].addRoute }" :add-label="t(COPY[role].add)">
      <FilterSearch id="u-search" v-model="filters.q" :placeholder="t('Search by name or email')"
                    @update:model-value="load(1)" />
      <FilterSelect id="u-status" v-model="filters.status" :label="t('Status')" :options="statusOptions"
                    @update:model-value="load(1)" />
    </FilterBar>

    <AppSpinner v-if="loading" :label="COPY[role].loading" />
    <EmptyState v-else-if="users.length === 0" class="mt-4" :title="COPY[role].empty" />

    <template v-else>
      <div class="card table-wrap mt-4 overflow-x-auto">
        <table class="table-cards w-full text-start text-sm">
          <thead class="border-b border-slate-200 text-slate-600">
            <tr>
              <th scope="col" class="p-3">{{ t('Name') }}</th>
              <th scope="col" class="p-3">{{ t('Email') }}</th>
              <th scope="col" class="p-3">{{ t('Status') }}</th>
              <th scope="col" class="p-3">{{ t('Joined') }}</th>
              <th scope="col" class="p-3">{{ t('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b border-slate-100 last:border-0">
              <td :data-label="t('Name')" class="p-3">
                <button type="button" class="details-link" @click="openDetails(user)">{{ user.fullName }}</button>
              </td>
              <td :data-label="t('Email')" class="p-3 text-slate-700">{{ user.email }}</td>
              <td :data-label="t('Status')" class="p-3">
                <DeletedBadge v-if="user.deletedAt" />
                <span v-else class="rounded-full border px-2 py-0.5 text-xs"
                      :class="user.status === 'ACTIVE'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-slate-400 bg-slate-100 text-slate-800'">
                  {{ rawEnumText(user.status) }}
                </span>
              </td>
              <td :data-label="t('Joined')" class="p-3 text-slate-600">{{ formatDateTime(user.createdAt) }}</td>
              <td :data-label="t('Actions')" class="p-3">
                <button v-if="user.deletedAt" type="button" :disabled="busy === user.id"
                        class="action-link text-brand-700 hover:underline" @click="restore(user)">
                  {{ t('Restore') }}
                </button>
                <!-- An admin cannot suspend or delete themselves: locking the
                     last administrator out is unrecoverable. -->
                <span v-else-if="user.id === auth.user?.id" class="text-xs text-slate-500">{{ t('This is you') }}</span>
                <span v-else class="flex flex-wrap gap-x-4 gap-y-2">
                  <button v-if="user.status === 'ACTIVE'" type="button" :disabled="busy === user.id"
                          class="action-link text-red-700 hover:underline" @click="askSuspend(user)">
                    {{ t('Suspend') }}
                  </button>
                  <button v-else type="button" :disabled="busy === user.id"
                          class="action-link text-brand-700 hover:underline" @click="reactivate(user)">
                    {{ t('Reactivate') }}
                  </button>
                  <button type="button" :disabled="busy === user.id"
                          class="action-link action-delete text-red-700 hover:underline" @click="askDelete(user)">
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
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmAction" @cancel="dialog.open = false" />
    <DetailsDialog :open="details.open" :loading="details.loading" :title="details.user?.fullName ?? ''"
                   :fields="detailFields" @close="details.open = false" />
  </div>
</template>
