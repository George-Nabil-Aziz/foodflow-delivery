<script setup>
import { computed, onMounted, ref } from 'vue';
import { restaurantApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { useFormErrors } from '../../composables/useFormErrors.js';
import { rules, validate } from '../../composables/useValidation.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import AppInput from '../../components/shared/AppInput.vue';

const ui = useUiStore();
const { capture, clear, fieldError } = useFormErrors();

const items = ref([]);
const categories = ref([]);
const loading = ref(true);
const busy = ref(null);
const saving = ref(false);
const filterCategory = ref('');
const filterAvailability = ref('');
const search = ref('');

const showForm = ref(false);
const editingId = ref(null);
const localErrors = ref({});
const blank = () => ({ categoryId: '', name: '', description: '', price: '', imageUrl: '', isAvailable: true });
const form = ref(blank());

async function load() {
  loading.value = true;
  try {
    const params = {};
    if (filterCategory.value) params.categoryId = filterCategory.value;
    if (filterAvailability.value) params.isAvailable = filterAvailability.value;
    if (search.value.trim().length >= 1) params.q = search.value.trim();

    const [itemRes, categoryRes] = await Promise.all([
      restaurantApi.items(params),
      restaurantApi.categories(),
    ]);
    items.value = itemRes.data;
    categories.value = categoryRes.data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const categoryName = (id) => categories.value.find((c) => c.id === id)?.name ?? '';
const canCreate = computed(() => categories.value.length > 0);

function startCreate() {
  editingId.value = null;
  form.value = blank();
  form.value.categoryId = categories.value[0]?.id ?? '';
  localErrors.value = {};
  clear();
  showForm.value = true;
}

function startEdit(item) {
  editingId.value = item.id;
  form.value = {
    categoryId: item.categoryId,
    name: item.name,
    description: item.description ?? '',
    price: item.price,
    imageUrl: item.imageUrl ?? '',
    isAvailable: item.isAvailable,
  };
  localErrors.value = {};
  clear();
  showForm.value = true;
}

async function save() {
  clear();
  localErrors.value = validate(form.value, {
    name: [rules.required('Name'), rules.minLength(2, 'Name'), rules.maxLength(120, 'Name')],
    price: [rules.required('Price'), rules.price],
    categoryId: [rules.required('Category')],
  });
  if (Object.keys(localErrors.value).length) return;

  saving.value = true;
  try {
    const payload = { ...form.value };
    if (!payload.description) delete payload.description;
    if (!payload.imageUrl) delete payload.imageUrl;

    if (editingId.value) await restaurantApi.updateItem(editingId.value, payload);
    else await restaurantApi.createItem(payload);

    ui.toastSuccess(editingId.value ? 'Item updated' : 'Item added');
    showForm.value = false;
    await load();
  } catch (err) {
    capture(err);
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    saving.value = false;
  }
}

/**
 * Availability has its own endpoint and its own control on every row: "we ran
 * out" is the most frequent action of the day and must never require opening a
 * form. Optimistic, with rollback if the server refuses.
 */
async function toggleAvailability(item) {
  const previous = item.isAvailable;
  item.isAvailable = !previous;
  busy.value = item.id;
  try {
    await restaurantApi.setAvailability(item.id, !previous);
  } catch (err) {
    item.isAvailable = previous;
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

async function remove(item) {
  busy.value = item.id;
  try {
    await restaurantApi.deleteItem(item.id);
    ui.toast(t('{name} removed from the menu', { name: item.name }));
    await load();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Menu items') }}</h1>
      <AppButton :disabled="!canCreate" @click="startCreate">{{ t('Add item') }}</AppButton>
    </div>

    <p v-if="!canCreate && !loading" class="mt-2 text-sm text-slate-600">
      {{ t('Create a category first: every item belongs to one.') }}
    </p>

    <div class="card mt-4 grid gap-3 p-4 sm:grid-cols-3">
      <div>
        <label for="menu-search" class="field-label">{{ t('Search') }}</label>
        <input id="menu-search" v-model="search" type="search" class="field-input"
               :placeholder="t('Item name')" @input="load">
      </div>
      <div>
        <label for="menu-category" class="field-label">{{ t('Category') }}</label>
        <select id="menu-category" v-model="filterCategory" class="field-input" @change="load">
          <option value="">{{ t('All categories') }}</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div>
        <label for="menu-availability" class="field-label">{{ t('Availability') }}</label>
        <select id="menu-availability" v-model="filterAvailability" class="field-input" @change="load">
          <option value="">{{ t('All') }}</option>
          <option value="true">{{ t('Available') }}</option>
          <option value="false">{{ t('Unavailable') }}</option>
        </select>
      </div>
    </div>

    <form v-if="showForm" class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="save">
      <h2 class="font-semibold text-slate-900">{{ editingId ? t('Edit item') : t('New item') }}</h2>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="item-category" class="field-label">{{ t('Category') }} <span class="text-red-600">*</span></label>
          <select id="item-category" v-model="form.categoryId" class="field-input">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <p v-if="localErrors.categoryId || fieldError('categoryId')" class="field-error">
            {{ t(localErrors.categoryId || fieldError('categoryId')) }}
          </p>
        </div>

        <AppInput id="item-name" v-model="form.name" label="Name" required
                  :error="localErrors.name || fieldError('name')" />
        <AppInput id="item-price" v-model="form.price" label="Price" required
                  hint="Up to two decimals, for example 58.00"
                  :error="localErrors.price || fieldError('price')" />
        <AppInput id="item-image" v-model="form.imageUrl" label="Image URL"
                  hint="Must start with http:// or https://"
                  :error="fieldError('imageUrl')" />
      </div>

      <div>
        <label for="item-description" class="field-label">{{ t('Description') }}</label>
        <textarea id="item-description" v-model="form.description" rows="2" maxlength="1000"
                  class="field-input" />
      </div>

      <label class="flex items-center gap-2 text-sm">
        <input v-model="form.isAvailable" type="checkbox"> {{ t('Available to order') }}
      </label>

      <div class="flex gap-2">
        <AppButton type="submit" :loading="saving">{{ editingId ? t('Save changes') : t('Add item') }}</AppButton>
        <AppButton variant="secondary" @click="showForm = false">{{ t('Cancel') }}</AppButton>
      </div>
    </form>

    <AppSpinner v-if="loading" label="Loading menu" />

    <EmptyState v-else-if="items.length === 0" class="mt-4"
                title="No items yet"
                message="Add your first dish so customers have something to order." />

    <ul v-else class="mt-4 space-y-2">
      <li v-for="item in items" :key="item.id" class="card p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="font-medium text-slate-900">{{ item.name }}</p>
            <p class="text-sm text-slate-600">
              {{ categoryName(item.categoryId) }} &middot; {{ formatMoney(item.price) }}
            </p>
            <p v-if="item.description" class="mt-1 text-sm text-slate-600">{{ item.description }}</p>
          </div>

          <div class="flex shrink-0 items-center gap-4">
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" :checked="item.isAvailable" :disabled="busy === item.id"
                     :aria-label="item.isAvailable
                       ? t('{name} is available', { name: item.name })
                       : t('{name} is unavailable', { name: item.name })"
                     @change="toggleAvailability(item)">
              <span :class="item.isAvailable ? 'text-emerald-800' : 'text-slate-500'">
                {{ item.isAvailable ? t('Available') : t('Unavailable') }}
              </span>
            </label>

            <button type="button" class="action-link text-sm text-brand-700 hover:underline" @click="startEdit(item)">
              {{ t('Edit') }}
            </button>
            <button type="button" class="action-link text-sm text-red-700 hover:underline"
                    :disabled="busy === item.id" @click="remove(item)">
              {{ t('Delete') }}
            </button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
