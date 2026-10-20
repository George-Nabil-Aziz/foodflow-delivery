<script setup>
import { onMounted, ref } from 'vue';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatDateTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppPagination from '../../components/shared/AppPagination.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import FilterBar from '../../components/shared/FilterBar.vue';
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

async function load(page = 1) {
  loading.value = true;
  try {
    const params = { page, limit: pageSize.value };
    if (statusFilter.value) params.status = statusFilter.value;
    if (search.value.trim().length >= 2) params.q = search.value.trim();
    const res = await adminApi.reviews(params);
    reviews.value = res.data;
    pagination.value = res.meta.pagination ?? { page: 1, totalPages: 1, total: res.data.length };
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
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Review moderation') }}</h1>

    <FilterBar>
      <FilterSearch id="rv-search" v-model="search" :placeholder="t('Search by restaurant, customer or comment')" @update:model-value="load(1)" />
      <FilterSelect id="rv-status" v-model="statusFilter" :label="t('Status')" @update:model-value="load(1)">
        <option value="">{{ t('All reviews') }}</option>
        <option value="PUBLISHED">{{ t('Published') }}</option>
        <option value="HIDDEN">{{ t('Hidden') }}</option>
      </FilterSelect>
    </FilterBar>

    <AppSpinner v-if="loading" label="Loading reviews" />
    <EmptyState v-else-if="reviews.length === 0" class="mt-4" title="No reviews match this filter" />

    <template v-else>
      <ul class="mt-4 space-y-3">
        <li v-for="review in reviews" :key="review.id" class="card p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-slate-900">
                {{ review.restaurant.name }}
                <span class="ms-2 text-sm font-normal text-slate-600">
                  <span aria-hidden="true">&starf;</span> {{ review.restaurantRating }}/5
                </span>
                <span v-if="review.status === 'HIDDEN'"
                      class="ms-2 rounded-full border border-slate-400 bg-slate-100 px-2 py-0.5 text-xs">
                  {{ t('Hidden') }}
                </span>
              </p>
              <p class="text-xs text-slate-500">
                {{ review.customer.displayName }} &middot; {{ formatDateTime(review.createdAt) }}
              </p>
              <!-- Rendered as text: user content is never interpreted as markup. -->
              <p v-if="review.comment" class="mt-2 text-sm text-slate-700">{{ review.comment }}</p>
              <p v-if="review.moderationReason" class="mt-1 text-xs text-slate-500">
                {{ t('Hidden because: {reason}', { reason: review.moderationReason }) }}
              </p>
            </div>

            <div class="shrink-0">
              <button v-if="review.status === 'PUBLISHED'" type="button" :disabled="busy === review.id"
                      class="action-link text-sm text-red-700 hover:underline" @click="askHide(review)">
                {{ t('Hide') }}
              </button>
              <button v-else type="button" :disabled="busy === review.id"
                      class="action-link text-sm text-brand-700 hover:underline" @click="restore(review)">
                {{ t('Restore') }}
              </button>
            </div>
          </div>
        </li>
      </ul>
      <AppPagination :pagination="pagination" :limit="pageSize" @change="load"
          @update:limit="(n) => { pageSize = n; load(1); }" />
    </template>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmHide" @cancel="dialog.open = false" />
  </div>
</template>
