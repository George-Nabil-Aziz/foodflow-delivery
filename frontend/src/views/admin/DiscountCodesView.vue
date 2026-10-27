<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatDateTime } from '../../utils/datetime.js';
import { formatMoney } from '../../utils/money.js';
import { countEach } from '../../utils/countEach.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import FilterBar from '../../components/shared/FilterBar.vue';
import PageTitle from '../../components/shared/PageTitle.vue';
import FilterSearch from '../../components/shared/FilterSearch.vue';
import FilterSelect from '../../components/shared/FilterSelect.vue';
import DetailsDialog from '../../components/shared/DetailsDialog.vue';

/**
 * Discount codes: every code with where it applies, how much it has been used
 * and what it has given away. Creating and editing happen on a page of their
 * own; deactivating and deleting ask for a reason and are audited.
 */
const ui = useUiStore();

const codes = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const pageSize = ref(20);
const loading = ref(true);
const busy = ref(null);
// status: '' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SCHEDULED'
const filters = ref({ status: '', q: '' });
const dialog = ref({ open: false, config: {}, code: null, action: null });
const details = ref({ open: false, code: null });
const counts = ref({});

const STATUSES = ['', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'SCHEDULED'];
const STATE_LABEL = { ACTIVE: 'Active', INACTIVE: 'Inactive', EXPIRED: 'Expired', SCHEDULED: 'Scheduled' };
const STATE_CLASS = {
  ACTIVE: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  INACTIVE: 'border-slate-400 bg-slate-100 text-slate-800',
  EXPIRED: 'border-amber-300 bg-amber-50 text-amber-900',
  SCHEDULED: 'border-sky-300 bg-sky-50 text-sky-900',
};

/** One choice's query, shared by the list and its count. */
function paramsFor(status, page, limit) {
  const params = { page, limit };
  if (status) params.status = status;
  if (filters.value.q.trim().length >= 1) params.q = filters.value.q.trim();
  return params;
}

const statusOptions = computed(() => [
  { value: '', label: t('All statuses') },
  ...STATUSES.filter(Boolean).map((value) => ({ value, label: t(STATE_LABEL[value], null, 'status') })),
].map((o) => ({ ...o, count: counts.value[o.value] })));

async function load(page = 1) {
  loading.value = true;
  try {
    const [res, totals] = await Promise.all([
      adminApi.discountCodes(paramsFor(filters.value.status, page, pageSize.value)),
      countEach(STATUSES, (status) => adminApi.discountCodes(paramsFor(status, 1, 1))),
    ]);
    codes.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
    counts.value = totals;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());

/** "10% off, up to EGP 30.00" or "EGP 15.00 off". */
function discountText(code) {
  if (code.type === 'FIXED') return t('{amount} off', { amount: formatMoney(code.value) });
  const base = t('{percent}% off', { percent: Number(code.value) });
  return code.maxDiscountAmount
    ? `${base}, ${t('up to {amount}', { amount: formatMoney(code.maxDiscountAmount) })}`
    : base;
}

const usageText = (code) => (code.usageLimit
  ? t('{used} of {limit}', { used: code.stats.usageCount, limit: code.usageLimit })
  : String(code.stats.usageCount));

const appliesTo = (code) => code.restaurant?.name ?? t('All restaurants');

function validityText(code) {
  if (!code.startsAt && !code.endsAt) return t('Always');
  const from = code.startsAt ? formatDateTime(code.startsAt) : '…';
  const to = code.endsAt ? formatDateTime(code.endsAt) : '…';
  return `${from} – ${to}`;
}

const detailFields = computed(() => {
  const c = details.value.code;
  if (!c) return [];
  return [
    { label: t('Code'), value: c.code },
    { label: t('Description'), value: c.description },
    { label: t('Discount'), value: discountText(c) },
    { label: t('Minimum subtotal'), value: formatMoney(c.minSubtotal) },
    { label: t('Applies to'), value: appliesTo(c) },
    { label: t('Valid'), value: validityText(c) },
    { label: t('Times used'), value: usageText(c) },
    { label: t('Limit per customer'), value: c.perCustomerLimit ?? t('No limit') },
    { label: t('Total discount given'), value: formatMoney(c.stats.totalDiscount) },
    { label: t('Status'), value: t(STATE_LABEL[c.state], null, 'status') },
    { label: t('Created'), value: formatDateTime(c.createdAt) },
  ];
});

function askDeactivate(code) {
  dialog.value = {
    open: true, code, action: 'deactivate',
    config: {
      title: t('Deactivate {code}?', { code: code.code }),
      message: 'Customers can no longer use this code, including carts that already have it applied. Orders already placed keep their discount.',
      confirmLabel: 'Deactivate code',
      requireReason: true,
      variant: 'danger',
    },
  };
}

function askDelete(code) {
  dialog.value = {
    open: true, code, action: 'delete',
    config: {
      title: t('Delete {code}?', { code: code.code }),
      message: 'The code disappears from this list and can no longer be used. Orders already placed keep their discount.',
      confirmLabel: 'Delete code',
      requireReason: true,
      variant: 'danger',
    },
  };
}

async function confirmAction({ reason }) {
  const { code, action } = dialog.value;
  dialog.value = { ...dialog.value, open: false };
  busy.value = code.id;
  try {
    if (action === 'deactivate') {
      await adminApi.deactivateDiscountCode(code.id, reason);
      ui.toastSuccess(t('{code} deactivated', { code: code.code }));
    } else {
      await adminApi.deleteDiscountCode(code.id, reason);
      ui.toastSuccess(t('{code} deleted', { code: code.code }));
    }
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

async function reactivate(code) {
  busy.value = code.id;
  try {
    await adminApi.reactivateDiscountCode(code.id);
    ui.toastSuccess(t('{code} reactivated', { code: code.code }));
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
    <PageTitle :title="t('Discount codes')" :count="loading ? null : pagination.total" />

    <FilterBar :add-to="{ name: 'admin-discount-code-new' }" :add-label="t('Add a discount code')">
      <FilterSearch id="dc-search" v-model="filters.q" :placeholder="t('Search by code or description')"
                    @update:model-value="load(1)" />
      <FilterSelect id="dc-status" v-model="filters.status" :label="t('Status')" :options="statusOptions"
                    @update:model-value="load(1)" />
    </FilterBar>

    <AppSpinner v-if="loading" label="Loading discount codes" />
    <EmptyState v-else-if="codes.length === 0" class="mt-4" title="No discount codes match these filters" />

    <template v-else>
      <div class="card table-wrap mt-4 overflow-x-auto">
        <table class="table-cards w-full text-start text-sm">
          <thead class="border-b border-slate-200 text-slate-600">
            <tr>
              <th scope="col" class="p-3">{{ t('Code') }}</th>
              <th scope="col" class="p-3">{{ t('Discount') }}</th>
              <th scope="col" class="p-3">{{ t('Applies to') }}</th>
              <th scope="col" class="p-3">{{ t('Used') }}</th>
              <th scope="col" class="p-3">{{ t('Total discount given') }}</th>
              <th scope="col" class="p-3">{{ t('Status') }}</th>
              <th scope="col" class="p-3">{{ t('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="code in codes" :key="code.id" class="border-b border-slate-100 last:border-0">
              <td :data-label="t('Code')" class="p-3">
                <button type="button" class="details-link font-mono" @click="details = { open: true, code }">{{ code.code }}</button>
              </td>
              <td :data-label="t('Discount')" class="p-3 text-slate-700">{{ discountText(code) }}</td>
              <td :data-label="t('Applies to')" class="p-3 text-slate-700">{{ appliesTo(code) }}</td>
              <td :data-label="t('Used')" class="p-3 text-slate-700">{{ usageText(code) }}</td>
              <td :data-label="t('Total discount given')" class="p-3 text-slate-700">{{ formatMoney(code.stats.totalDiscount) }}</td>
              <td :data-label="t('Status')" class="p-3">
                <span class="rounded-full border px-2 py-0.5 text-xs" :class="STATE_CLASS[code.state]">
                  {{ t(STATE_LABEL[code.state], null, 'status') }}
                </span>
              </td>
              <td :data-label="t('Actions')" class="p-3">
                <span class="flex flex-wrap gap-x-4 gap-y-2">
                  <RouterLink :to="{ name: 'admin-discount-code-edit', params: { id: code.id } }"
                              class="action-link text-brand-700 hover:underline">
                    {{ t('Edit') }}
                  </RouterLink>
                  <button v-if="code.isActive" type="button" :disabled="busy === code.id"
                          class="action-link text-red-700 hover:underline" @click="askDeactivate(code)">
                    {{ t('Deactivate') }}
                  </button>
                  <button v-else type="button" :disabled="busy === code.id"
                          class="action-link text-brand-700 hover:underline" @click="reactivate(code)">
                    {{ t('Reactivate') }}
                  </button>
                  <button type="button" :disabled="busy === code.id"
                          class="action-link action-delete text-red-700 hover:underline" @click="askDelete(code)">
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
    <DetailsDialog :open="details.open" :title="details.code?.code ?? ''"
                   :fields="detailFields" @close="details.open = false" />
  </div>
</template>
