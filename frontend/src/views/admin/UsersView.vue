<script setup>
import { onMounted, ref } from 'vue';
import { adminApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatDateTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const auth = useAuthStore();
const ui = useUiStore();

const users = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const loading = ref(true);
const busy = ref(null);
const filters = ref({ role: '', status: '', q: '' });
const dialog = ref({ open: false, config: {}, user: null });

async function load(page = 1) {
  loading.value = true;
  try {
    const params = { page, limit: 20 };
    if (filters.value.role) params.role = filters.value.role;
    if (filters.value.status) params.status = filters.value.status;
    if (filters.value.q.trim().length >= 2) params.q = filters.value.q.trim();

    const res = await adminApi.users(params);
    users.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());

/** Destructive actions name their target and require a reason. */
function askSuspend(user) {
  dialog.value = {
    open: true,
    user,
    config: {
      title: t('Suspend {name}?', { name: user.fullName }),
      message: t('This immediately ends every session for {email} and blocks their existing access token. They will not be able to sign in until reactivated.', { email: user.email }),
      confirmLabel: 'Suspend account',
      requireReason: true,
      variant: 'danger',
    },
  };
}

async function confirmSuspend({ reason }) {
  const user = dialog.value.user;
  dialog.value = { ...dialog.value, open: false };
  busy.value = user.id;
  try {
    await adminApi.suspendUser(user.id, reason);
    ui.toastSuccess(t('{name} suspended', { name: user.fullName }));
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

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
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Users') }}</h1>

    <div class="card mt-4 grid gap-3 p-4 sm:grid-cols-3">
      <div>
        <label for="u-search" class="field-label">{{ t('Search') }}</label>
        <input id="u-search" v-model="filters.q" type="search" class="field-input"
               :placeholder="t('Name or email')" @input="load(1)">
      </div>
      <div>
        <label for="u-role" class="field-label">{{ t('Role') }}</label>
        <select id="u-role" v-model="filters.role" class="field-input" @change="load(1)">
          <option value="">{{ t('All roles') }}</option>
          <!-- The raw enum, as it has always read; translated in Arabic. -->
          <option v-for="r in ['CUSTOMER', 'RESTAURANT', 'DRIVER', 'ADMIN']" :key="r" :value="r">{{ t(r) }}</option>
        </select>
      </div>
      <div>
        <label for="u-status" class="field-label">{{ t('Status') }}</label>
        <select id="u-status" v-model="filters.status" class="field-input" @change="load(1)">
          <option value="">{{ t('All statuses') }}</option>
          <option value="ACTIVE">{{ t('Active', null, 'status') }}</option>
          <option value="SUSPENDED">{{ t('Suspended') }}</option>
        </select>
      </div>
    </div>

    <AppSpinner v-if="loading" label="Loading users" />
    <EmptyState v-else-if="users.length === 0" class="mt-4" title="No users match these filters" />

    <template v-else>
      <div class="card table-wrap mt-4 overflow-x-auto">
        <table class="table-cards w-full text-start text-sm">
          <thead class="border-b border-slate-200 text-slate-600">
            <tr>
              <th scope="col" class="p-3">{{ t('Name') }}</th>
              <th scope="col" class="p-3">{{ t('Email') }}</th>
              <th scope="col" class="p-3">{{ t('Role') }}</th>
              <th scope="col" class="p-3">{{ t('Status') }}</th>
              <th scope="col" class="p-3">{{ t('Joined') }}</th>
              <th scope="col" class="p-3">{{ t('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b border-slate-100 last:border-0">
              <td :data-label="t('Name')" class="p-3 font-medium text-slate-900">{{ user.fullName }}</td>
              <td :data-label="t('Email')" class="p-3 text-slate-700">{{ user.email }}</td>
              <td :data-label="t('Role')" class="p-3 text-slate-700">{{ t(user.role) }}</td>
              <td :data-label="t('Status')" class="p-3">
                <span class="rounded-full border px-2 py-0.5 text-xs"
                      :class="user.status === 'ACTIVE'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-slate-400 bg-slate-100 text-slate-800'">
                  {{ t(user.status) }}
                </span>
              </td>
              <td :data-label="t('Joined')" class="p-3 text-slate-600">{{ formatDateTime(user.createdAt) }}</td>
              <td :data-label="t('Actions')" class="p-3">
                <!-- An admin cannot suspend themselves: locking the last
                     administrator out is unrecoverable. -->
                <span v-if="user.id === auth.user?.id" class="text-xs text-slate-500">{{ t('This is you') }}</span>
                <button v-else-if="user.status === 'ACTIVE'" type="button" :disabled="busy === user.id"
                        class="action-link text-red-700 hover:underline" @click="askSuspend(user)">
                  {{ t('Suspend') }}
                </button>
                <button v-else type="button" :disabled="busy === user.id"
                        class="action-link text-brand-700 hover:underline" @click="reactivate(user)">
                  {{ t('Reactivate') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :pagination="pagination" @change="load" />
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmSuspend" @cancel="dialog.open = false" />
  </div>
</template>
