<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { rules, validate } from '../../composables/useValidation.js';
import { t } from '../../i18n/index.js';
import { enumText } from '../../utils/labels.js';
import AppButton from '../../components/shared/AppButton.vue';
import AppInput from '../../components/shared/AppInput.vue';

const ui = useUiStore();

const creating = ref(false);
const localErrors = ref({});

const blank = () => ({ email: '', fullName: '', phone: '', vehicleType: 'MOTORCYCLE', vehiclePlate: '' });
const form = ref(blank());
const isBicycle = computed(() => form.value.vehicleType === 'BICYCLE');
/** Shown exactly once, here: it is never retrievable again. */
const issuedPassword = ref(null);


async function create() {
  localErrors.value = validate(form.value, {
    fullName: [rules.required('Name'), rules.minLength(2, 'Name')],
    email: [rules.required('Email'), rules.email],
    phone: [rules.required('Phone'), rules.phone],
    // A bicycle has no plate.
    ...(isBicycle.value ? {} : { vehiclePlate: [rules.required('Plate'), rules.minLength(2, 'Plate')] }),
  });
  if (Object.keys(localErrors.value).length) return;

  creating.value = true;
  try {
    const { vehiclePlate, ...rest } = form.value;
    const { data } = await adminApi.createDriver(isBicycle.value ? rest : { ...rest, vehiclePlate });
    issuedPassword.value = { email: data.user.email, password: data.initialPassword };
    form.value = blank();
    ui.toastSuccess('Driver account created');
  } catch (err) {
    if (err.code === 'EMAIL_ALREADY_REGISTERED') {
      localErrors.value = { email: 'An account with this email already exists.' };
    } else {
      ui.toastError(err.details?.[0]?.issue ?? err.message);
    }
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Add a driver') }}</h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ t("Drivers cannot sign themselves up: they receive customers' home addresses, so every account is created here and approved separately.") }}
    </p>

    <div v-if="issuedPassword"
         class="card mt-4 border-emerald-300 bg-emerald-50 p-4 text-sm" role="status">
      <p class="font-medium text-emerald-900">{{ t('Account created') }}</p>
      <p class="mt-1 text-emerald-900">
        {{ t('Give these details to the driver now. The password is shown only once and cannot be retrieved later.') }}
      </p>
      <p class="mt-2 select-all font-mono text-emerald-950">
        {{ issuedPassword.email }}<br>{{ issuedPassword.password }}
      </p>
      <button type="button" class="mt-2 text-xs underline" @click="issuedPassword = null">
        {{ t('I have saved it') }}
      </button>
    </div>

    <form class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="create">
      <AppInput id="nd-name" v-model="form.fullName" label="Full name" required :error="localErrors.fullName" />
      <AppInput id="nd-email" v-model="form.email" label="Email" type="email" required :error="localErrors.email" />
      <AppInput id="nd-phone" v-model="form.phone" label="Phone" required :error="localErrors.phone" />
      <div>
        <label for="nd-vehicle" class="field-label">{{ t('Vehicle') }}</label>
        <select id="nd-vehicle" v-model="form.vehicleType" class="field-input">
          <option v-for="v in ['BICYCLE', 'MOTORCYCLE', 'CAR']" :key="v" :value="v">{{ enumText(v) }}</option>
        </select>
      </div>
      <AppInput v-if="!isBicycle" id="nd-plate" v-model="form.vehiclePlate" label="Plate number" required :error="localErrors.vehiclePlate" />
      <AppButton type="submit" :loading="creating">{{ t('Create driver') }}</AppButton>
    </form>

    <RouterLink :to="{ name: 'admin-drivers' }" class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
      {{ t('Back to drivers') }}
    </RouterLink>
  </div>
</template>
