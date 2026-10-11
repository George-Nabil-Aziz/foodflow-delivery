<script setup>
import { onMounted, ref } from 'vue';
import { reviewApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { formatDateTime } from '../../utils/datetime.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import StarRating from '../../components/shared/StarRating.vue';
import { t } from '../../i18n/index.js';

const ui = useUiStore();
const reviews = ref([]);
const loading = ref(true);
const editingId = ref(null);
const draft = ref({ restaurantRating: null, comment: '' });
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    reviews.value = (await reviewApi.mine({ limit: 20 })).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function startEdit(review) {
  editingId.value = review.id;
  draft.value = { restaurantRating: review.restaurantRating, comment: review.comment ?? '' };
}

async function save(review) {
  saving.value = true;
  try {
    await reviewApi.update(review.id, {
      restaurantRating: draft.value.restaurantRating,
      comment: draft.value.comment || undefined,
    });
    editingId.value = null;
    ui.toastSuccess('Review updated');
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('My reviews') }}</h1>

    <AppSpinner v-if="loading" label="Loading reviews" />

    <EmptyState v-else-if="reviews.length === 0" class="mt-4"
                title="No reviews yet"
                message="After an order is delivered you can rate it." />

    <ul v-else class="mt-4 space-y-3">
      <li v-for="review in reviews" :key="review.id" class="card p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium text-slate-900">{{ review.restaurantName }}</p>
            <p class="text-xs text-slate-500">{{ formatDateTime(review.createdAt) }}</p>

            <template v-if="editingId === review.id">
              <div class="mt-3 space-y-3">
                <StarRating v-model="draft.restaurantRating" name="edit-rating" :label="t('Your rating')" />
                <textarea v-model="draft.comment" rows="3" maxlength="1000" class="field-input" />
                <div class="flex gap-2">
                  <AppButton size="sm" :loading="saving" @click="save(review)">{{ t('Save') }}</AppButton>
                  <AppButton size="sm" variant="secondary" @click="editingId = null">{{ t('Cancel') }}</AppButton>
                </div>
              </div>
            </template>

            <template v-else>
              <p class="mt-2 text-sm text-slate-800">
                <span aria-hidden="true">&starf;</span> {{ review.restaurantRating }}/5
                <span v-if="review.driverRating" class="ms-2 text-slate-600">
                  {{ t('Driver {rating}/5', { rating: review.driverRating }) }}
                </span>
              </p>
              <p v-if="review.comment" class="mt-1 text-sm text-slate-700">{{ review.comment }}</p>
            </template>
          </div>

          <div v-if="editingId !== review.id" class="shrink-0 text-end">
            <!--
              The edit control is disabled with a stated reason once the window
              closes, rather than failing on submit.
            -->
            <button type="button" class="action-link text-xs text-brand-700 hover:underline disabled:text-slate-400 disabled:no-underline"
                    :disabled="!review.isEditable" @click="startEdit(review)">
              {{ t('Edit') }}
            </button>
            <p v-if="!review.isEditable" class="mt-1 max-w-[10rem] text-xs text-slate-500">
              {{ t('Editing closed 24 hours after posting') }}
            </p>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
