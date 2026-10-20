<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { restaurantApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { rules, validate } from '../../composables/useValidation.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import AppButton from '../../components/shared/AppButton.vue';
import AppInput from '../../components/shared/AppInput.vue';
import EmptyState from '../../components/shared/EmptyState.vue';

/**
 * "New category" and "Edit category" on a page of their own; the list stays
 * on the Categories page. There is no single-category endpoint, so an edit
 * finds its category in the list.
 */
const props = defineProps({ id: { type: String, default: null } });

const router = useRouter();
const ui = useUiStore();
const isEdit = computed(() => Boolean(props.id));
const loading = ref(true);
const missing = ref(false);
const saving = ref(false);
const localErrors = ref({});
const form = ref({ name: '', description: '', displayOrder: 0 });

onMounted(async () => {
  try {
    const categories = (await restaurantApi.categories()).data;
    if (isEdit.value) {
      const category = categories.find((c) => c.id === props.id);
      if (!category) { missing.value = true; return; }
      form.value = {
        name: category.name,
        description: category.description ?? '',
        displayOrder: category.displayOrder,
      };
    } else {
      // A new category goes to the end of the menu unless told otherwise.
      form.value.displayOrder = categories.length;
    }
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
});

async function save() {
  localErrors.value = validate(form.value, {
    name: [rules.required('Name'), rules.minLength(2, 'Name'), rules.maxLength(60, 'Name')],
  });
  if (Object.keys(localErrors.value).length) return;

  saving.value = true;
  try {
    const payload = { name: form.value.name, displayOrder: Number(form.value.displayOrder) };
    if (form.value.description) payload.description = form.value.description;

    if (isEdit.value) await restaurantApi.updateCategory(props.id, payload);
    else await restaurantApi.createCategory(payload);

    ui.toastSuccess(isEdit.value ? 'Category updated' : 'Category created');
    router.push({ name: 'restaurant-categories' });
  } catch (err) {
    if (err.status === 409) {
      localErrors.value = { name: 'You already have a category with this name.' };
    } else {
      ui.toastError(err.details?.[0]?.issue ?? err.message);
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ isEdit ? t('Edit category') : t('New category') }}</h1>

    <AppSpinner v-if="loading" label="Loading categories" />

    <EmptyState v-else-if="missing" class="mt-4" title="This category no longer exists" />

    <form v-else class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="save">
      <AppInput id="cat-name" v-model="form.name" label="Name" required :error="localErrors.name" />
      <div>
        <label for="cat-description" class="field-label">{{ t('Description') }}</label>
        <textarea id="cat-description" v-model="form.description" rows="2" maxlength="500"
                  class="field-input" />
      </div>
      <AppInput id="cat-order" v-model="form.displayOrder" label="Display order" type="number"
                hint="Lower numbers appear first." />
      <AppButton type="submit" :loading="saving">
        {{ isEdit ? t('Save changes') : t('Create category') }}
      </AppButton>
    </form>

    <RouterLink :to="{ name: 'restaurant-categories' }"
                class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
      {{ t('Back to categories') }}
    </RouterLink>
  </div>
</template>
