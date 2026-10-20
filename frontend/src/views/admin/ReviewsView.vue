<script setup>
import { computed, onMounted, ref } from 'vue';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatDateTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import { countEach } from '../../utils/countEach.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import RatingStars from '../../components/shared/RatingStars.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import DetailsDialog from '../../components/shared/DetailsDialog.vue';
import OrderDetailsDialog from '../../components/admin/OrderDetailsDialog.vue';
import FilterBar from '../../components/shared/FilterBar.vue';
import PageTitle from '../../components/shared/PageTitle.vue';
import FilterSearch from '../../components/shared/FilterSearch.vue';
import FilterSelect from '../../components/shared/FilterSelect.vue';

const ui = useUiStore();
const reviews = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const pageSize = ref(20);
const loading = ref(true);
const busy = ref(null);
const statusFilter = ref('');
const search = ref('');
const dialog = ref({ open: false, config: {}, review: null });
const details = ref({ open: false, review: null });
const orderDetails = ref({ open: false, id: null, orderNumber: '' });

const detailFields = computed(() => {
  const r = details.value.review;
  if (!r) return [];
  return [
    { label: t('Restaurant'), value: r.restaurant.name },
    { label: t('Restaurant rating'), value: r.restaurantRating, slot: 'stars' },
    { label: t('Customer'), value: r.customer.fullName ?? r.customer.displayName },
    { label: t('Customer email'), value: r.customer.email },
    { label: t('Order'), value: r.orderNumber, slot: 'order' },
    { label: t('Driver'), value: r.driver?.fullName },
    { label: t('Driver rating'), value: r.driverRating, slot: 'stars' },
    { label: t('Comment'), value: r.comment },
    { label: t('Status'), value: r.status === 'PUBLISHED' ? t('Published') : t('Hidden') },
    ...(r.status === 'HIDDEN' ? [
      { label: t('Hidden by'), value: r.hiddenBy },
      { label: t('Reason'), value: r.moderationReason },
    ] : []),
    { label: t('Date'), value: formatDateTime(r.createdAt) },
  ];
});

function openOrder() {
  const r = details.value.review;
  details.value.open = false;
  orderDetails.value = { open: true, id: r.orderId, orderNumber: r.orderNumber };
}

const counts = ref({});

/** One choice's query, shared by the list and its count. */
function paramsFor(status, page, limit) {
  const params = { page, limit };
  if (status) params.status = status;
  if (search.value.trim().length >= 1) params.q = search.value.trim();
  return params;
}

const statusOptions = computed(() => [
  { value: '', label: t('All reviews') },
  { value: 'PUBLISHED', label: t('Published') },
  { value: 'HIDDEN', label: t('Hidden') },
].map((o) => ({ ...o, count: counts.value[o.value] })));

async function load(page = 1) {
  loading.value = true;
  try {
    const [res, totals] = await Promise.all([
      adminApi.reviews(paramsFor(statusFilter.value, page, pageSize.value)),
      countEach(['', 'PUBLISHED', 'HIDDEN'], (status) => adminApi.reviews(paramsFor(status, 1, 1))),
    ]);
    reviews.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
    counts.value = totals;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());

function askHide(review) {
  dialog.value = {
    open: true,
    review,
    config: {
      title: 'Hide this review?',
      message: t("It will be removed from {restaurant}'s public page and excluded from their rating average. You can restore it later.", { restaurant: review.restaurant.name }),
      confirmLabel: 'Hide review',
      requireReason: true,
      variant: 'danger',
    },
  };
}

async function confirmHide({ reason }) {
  const review = dialog.value.review;
  dialog.value = { ...dialog.value, open: false };
  busy.value = review.id;
  try {
    await adminApi.hideReview(review.id, reason);
    ui.toastSuccess('Review hidden and rating recalculated');
    await load(pagination.value.page);
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}

async function restore(review) {
  busy.value = review.id;
  try {
    await adminApi.restoreReview(review.id);
    ui.toastSuccess('Review restored and rating recalculated');
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
    <PageTitle :title="t('Review moderation')" :count="loading ? null : pagination.total" />

    <FilterBar>
      <FilterSearch id="rv-search" v-model="search" :placeholder="t('Search by restaurant, customer or comment')" @update:model-value="load(1)" />
      <FilterSelect id="rv-status" v-model="statusFilter" :label="t('Status')" :options="statusOptions"
                    @update:model-value="load(1)" />
    </FilterBar>

    <AppSpinner v-if="loading" label="Loading reviews" />
    <EmptyState v-else-if="reviews.length === 0" class="mt-4" title="No reviews match this filter" />

    <template v-else>
      <div class="card table-wrap mt-4 overflow-x-auto">
        <table class="table-cards w-full text-start text-sm">
          <thead class="border-b border-slate-200 text-slate-600">
            <tr>
              <th scope="col" class="p-3">{{ t('Restaurant') }}</th>
              <th scope="col" class="p-3">{{ t('Customer') }}</th>
              <th scope="col" class="p-3">{{ t('Rating') }}</th>
              <th scope="col" class="p-3">{{ t('Comment') }}</th>
              <th scope="col" class="p-3">{{ t('Status') }}</th>
              <th scope="col" class="p-3">{{ t('Date') }}</th>
              <th scope="col" class="p-3">{{ t('Actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="review in reviews" :key="review.id" class="border-b border-slate-100 last:border-0">
              <td :data-label="t('Restaurant')" class="p-3">
                <button type="button" class="details-link" @click="details = { open: true, review }">{{ review.restaurant.name }}</button>
              </td>
              <td :data-label="t('Customer')" class="p-3 text-slate-700">{{ review.customer.displayName }}</td>
              <td :data-label="t('Rating')" class="p-3"><RatingStars :value="review.restaurantRating" /></td>
              <!-- Rendered as text: user content is never interpreted as markup. -->
              <td :data-label="t('Comment')" class="p-3 text-slate-700 lg:max-w-xs">
                <template v-if="review.comment">{{ review.comment }}</template>
                <span v-else class="text-slate-500">&mdash;</span>
              </td>
              <td :data-label="t('Status')" class="p-3">
                <span class="rounded-full border px-2 py-0.5 text-xs"
                      :class="review.status === 'PUBLISHED'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-slate-400 bg-slate-100 text-slate-800'">
                  {{ review.status === 'PUBLISHED' ? t('Published') : t('Hidden') }}
                </span>
                <span v-if="review.moderationReason" class="mt-1 block text-xs text-slate-500">
                  {{ review.moderationReason }}
                </span>
              </td>
              <td :data-label="t('Date')" class="p-3 text-slate-600">{{ formatDateTime(review.createdAt) }}</td>
              <td :data-label="t('Actions')" class="p-3">
                <button v-if="review.status === 'PUBLISHED'" type="button" :disabled="busy === review.id"
                        class="action-link text-red-700 hover:underline" @click="askHide(review)">
                  {{ t('Hide') }}
                </button>
                <button v-else type="button" :disabled="busy === review.id"
                        class="action-link text-brand-700 hover:underline" @click="restore(review)">
                  {{ t('Restore') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :pagination="pagination" :limit="pageSize" @change="load"
          @update:limit="(n) => { pageSize = n; load(1); }" />
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmHide" @cancel="dialog.open = false" />
    <DetailsDialog :open="details.open" :title="t('Review')" :fields="detailFields" @close="details.open = false">
      <template #stars="{ value }"><RatingStars :value="value" /></template>
      <template #order="{ value }">
        <button type="button" class="details-link" @click="openOrder">{{ value }}</button>
      </template>
    </DetailsDialog>
    <OrderDetailsDialog :open="orderDetails.open" :order-id="orderDetails.id" :order-number="orderDetails.orderNumber"
                        @close="orderDetails.open = false" />
  </div>
</template>
