<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { addressApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { useFormErrors } from '../../composables/useFormErrors.js';
import { rules, validate } from '../../composables/useValidation.js';
import AppInput from '../../components/shared/AppInput.vue';
import AppButton from '../../components/shared/AppButton.vue';
import { t } from '../../i18n/index.js';

/**
 * "Add an address" on a page of its own. Opened from the checkout
 * (?from=checkout), saving returns there so the order can go on; otherwise
 * it returns to the address list.
 */
const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const { capture, clear, fieldError } = useFormErrors();

const fromCheckout = computed(() => route.query.from === 'checkout');
const back = computed(() => (fromCheckout.value
  ? { to: { name: 'checkout' }, label: 'Back to checkout' }
  : { to: { name: 'addresses' }, label: 'Back to addresses' }));

const saving = ref(false);
const localErrors = ref({});
const form = ref({ label: '', line1: '', line2: '', city: '', district: '', postalCode: '' });

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
    ui.toastSuccess('Address added');
    router.push(back.value.to);
  } catch (err) {
    capture(err);
    ui.toastError(err.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Add an address') }}</h1>

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

    <RouterLink :to="back.to" class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
      {{ t(back.label) }}
    </RouterLink>
  </div>
</template>
