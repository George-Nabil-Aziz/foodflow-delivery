<script setup>
import { onMounted, ref } from 'vue';
import { restaurantApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { rules, validate } from '../../composables/useValidation.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import AppInput from '../../components/shared/AppInput.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const ui = useUiStore();
const categories = ref([]);
const loading = ref(true);
const saving = ref(false);
const busy = ref(null);
const localErrors = ref({});
const editingId = ref(null);
const form = ref({ name: '', description: '', displayOrder: 0 });
const deleteDialog = ref({ open: false, config: {}, category: null });

async function load() {
  loading.value = true;
  try {
    categories.value = (await restaurantApi.categories()).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function startEdit(category) {
  editingId.value = category.id;
  form.value = {
    name: category.name,
    description: category.description ?? '',
    displayOrder: category.displayOrder,
  };
}

function reset() {
  editingId.value = null;
  form.value = { name: '', description: '', displayOrder: categories.value.length };
  localErrors.value = {};
}

async function save() {
  localErrors.value = validate(form.value, {
    name: [rules.required('Name'), rules.minLength(2, 'Name'), rules.maxLength(60, 'Name')],
  });
  if (Object.keys(localErrors.value).length) return;

  saving.value = true;
  try {
    const payload = { name: form.value.name, displayOrder: Number(form.value.displayOrder) };
    if (form.value.description) payload.description = form.value.description;

    if (editingId.value) await restaurantApi.updateCategory(editingId.value, payload);
    else await restaurantApi.createCategory(payload);

    ui.toastSuccess(editingId.value ? 'Category updated' : 'Category created');
    reset();
    await load();
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

async function toggleActive(category) {
  const previous = category.isActive;
  category.isActive = !previous;
  busy.value = category.id;
  try {
    await restaurantApi.updateCategory(category.id, { isActive: !previous });
  } catch (err) {
    category.isActive = previous;
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

/** The non-empty rule is explained before the API has to refuse it. */
function askDelete(category) {
  deleteDialog.value = {
    open: true,
    category,
    config: {
      title: t('Delete "{name}"?', { name: category.name }),
      message: category.itemCount > 0
        ? t('This category still holds {count} item(s). Move or delete them first: a category with items cannot be removed.',
          { count: category.itemCount })
        : 'This category is empty and can be removed. Items are unaffected.',
      confirmLabel: 'Delete category',
      variant: 'danger',
    },
  };
}

async function confirmDelete() {
  const category = deleteDialog.value.category;
  deleteDialog.value = { ...deleteDialog.value, open: false };
  busy.value = category.id;
  try {
    await restaurantApi.deleteCategory(category.id);
    ui.toast('Category deleted');
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <section>
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Menu categories') }}</h1>

      <AppSpinner v-if="loading" label="Loading categories" />

      <EmptyState v-else-if="categories.length === 0" class="mt-4"
                  title="No categories yet"
                  message="Create your first category, then add items to it." />

      <ul v-else class="mt-4 space-y-2">
        <li v-for="category in categories" :key="category.id" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-medium text-slate-900">{{ category.name }}</p>
              <p class="text-sm text-slate-600">
                {{ t('{count} item(s)', { count: category.itemCount }) }} &middot;
                {{ t('order {n}', { n: category.displayOrder }) }}
              </p>
              <p v-if="!category.isActive" class="mt-1 text-sm text-slate-700">
                {{ t('Hidden from customers. Item availability is unchanged.') }}
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-3">
              <label class="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" :checked="category.isActive" :disabled="busy === category.id"
                       :aria-label="category.isActive
                         ? t('{name} is visible', { name: category.name })
                         : t('{name} is hidden', { name: category.name })"
                       @change="toggleActive(category)">
                {{ category.isActive ? t('Visible') : t('Hidden') }}
              </label>
              <button type="button" class="action-link text-sm text-brand-700 hover:underline" @click="startEdit(category)">
                {{ t('Edit') }}
              </button>
              <button type="button" class="action-link text-sm text-red-700 hover:underline" @click="askDelete(category)">
                {{ t('Delete') }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="text-lg font-semibold text-slate-900">
        {{ editingId ? t('Edit category') : t('New category') }}
      </h2>
      <form class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="save">
        <AppInput id="cat-name" v-model="form.name" label="Name" required :error="localErrors.name" />
        <div>
          <label for="cat-description" class="field-label">{{ t('Description') }}</label>
          <textarea id="cat-description" v-model="form.description" rows="2" maxlength="500"
                    class="field-input" />
        </div>
        <AppInput id="cat-order" v-model="form.displayOrder" label="Display order" type="number"
                  hint="Lower numbers appear first." />
        <div class="flex gap-2">
          <AppButton type="submit" :loading="saving">
            {{ editingId ? t('Save changes') : t('Create category') }}
          </AppButton>
          <AppButton v-if="editingId" variant="secondary" @click="reset">{{ t('Cancel') }}</AppButton>
        </div>
      </form>
    </section>

    <ConfirmDialog :open="deleteDialog.open" :config="deleteDialog.config"
                   @accept="confirmDelete" @cancel="deleteDialog.open = false" />
  </div>
</template>
