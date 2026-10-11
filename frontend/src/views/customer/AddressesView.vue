<script setup>
import { onMounted, ref } from 'vue';
import { addressApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { useFormErrors } from '../../composables/useFormErrors.js';
import { rules, validate } from '../../composables/useValidation.js';
import AppInput from '../../components/shared/AppInput.vue';
import AppButton from '../../components/shared/AppButton.vue';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import { t } from '../../i18n/index.js';

const ui = useUiStore();
const { capture, clear, fieldError } = useFormErrors();

const addresses = ref([]);
const loading = ref(true);
const saving = ref(false);
const busy = ref(null);
const localErrors = ref({});
const blank = () => ({ label: '', line1: '', line2: '', city: '', district: '', postalCode: '' });
const form = ref(blank());

async function load() {
  loading.value = true;
  try {
    addresses.value = (await addressApi.list()).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function create() {
  clear();
  localErrors.value = validate(form.value, {
    line1: [rules.required('Street address'), rules.minLength(5, 'Street address')],
    city: [rules.required('City'), rules.minLength(2, 'City')],
  });
  if (Object.keys(localErrors.value).length) return;

  saving.value = true;
  try {
    const payload = Object.fromEntries(
      Object.entries(form.value).filter(([, v]) => String(v).trim() !== ''),
    );
    await addressApi.create(payload);
    form.value = blank();
    ui.toastSuccess('Address added');
    await load();
  } catch (err) {
    capture(err);
    ui.toastError(err.message);
  } finally {
    saving.value = false;
  }
}

async function makeDefault(address) {
  busy.value = address.id;
  try {
    await addressApi.setDefault(address.id);
    await load();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

async function remove(address) {
  busy.value = address.id;
  try {
    await addressApi.remove(address.id);
    ui.toast('Address removed');
    await load();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <section>
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Delivery addresses') }}</h1>

      <AppSpinner v-if="loading" label="Loading addresses" />

      <EmptyState v-else-if="addresses.length === 0" class="mt-4"
                  title="No addresses yet"
                  message="Add one so you can check out." />

      <ul v-else class="mt-4 space-y-3">
        <li v-for="address in addresses" :key="address.id" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-medium text-slate-900">
                {{ address.label || t('Address') }}
                <span v-if="address.isDefault"
                      class="ms-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                  {{ t('Default') }}
                </span>
              </p>
              <p class="mt-1 text-sm text-slate-600">
                {{ address.line1 }}<template v-if="address.line2">, {{ address.line2 }}</template><br>
                <template v-if="address.district">{{ address.district }}, </template>{{ address.city }}
              </p>
            </div>
            <div class="flex shrink-0 flex-col gap-1 text-end">
              <button v-if="!address.isDefault" type="button" :disabled="busy === address.id"
                      class="action-link text-xs text-brand-700 hover:underline" @click="makeDefault(address)">
                {{ t('Make default') }}
              </button>
              <button type="button" :disabled="busy === address.id"
                      class="action-link text-xs text-red-700 hover:underline" @click="remove(address)">
                {{ t('Remove') }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="text-lg font-semibold text-slate-900">{{ t('Add an address') }}</h2>
      <form class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="create">
        <AppInput id="addr-label" v-model="form.label" label="Label" placeholder="Home, Work"
                  :error="fieldError('label')" />
        <AppInput id="addr-line1" v-model="form.line1" label="Street address" required
                  :error="localErrors.line1 || fieldError('line1')" />
        <AppInput id="addr-line2" v-model="form.line2" label="Apartment, floor (optional)"
                  :error="fieldError('line2')" />
        <div class="grid grid-cols-2 gap-3">
          <AppInput id="addr-city" v-model="form.city" label="City" required
                    :error="localErrors.city || fieldError('city')" />
          <AppInput id="addr-district" v-model="form.district" label="District"
                    :error="fieldError('district')" />
        </div>
        <AppInput id="addr-postal" v-model="form.postalCode" label="Postal code (optional)"
                  :error="fieldError('postalCode')" />
        <AppButton type="submit" :loading="saving">{{ t('Add address') }}</AppButton>
        <p class="text-xs text-slate-500">
          {{ t('Your first address becomes your default automatically.') }}
        </p>
      </form>
    </section>
  </div>
</template>
