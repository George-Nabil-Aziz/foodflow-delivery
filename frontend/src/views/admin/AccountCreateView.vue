<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { rules, validate } from '../../composables/useValidation.js';
import { t } from '../../i18n/index.js';
import AppButton from '../../components/shared/AppButton.vue';
import AppInput from '../../components/shared/AppInput.vue';

/**
 * "Add a customer / admin / restaurant": the same page as Add a driver, for
 * the accounts an admin can create without a vehicle. Drivers keep their own
 * page because they need one.
 */
const props = defineProps({ role: { type: String, required: true } }); // 'CUSTOMER' | 'ADMIN' | 'RESTAURANT'

const COPY = {
  CUSTOMER: { title: 'Add a customer', submit: 'Create customer', back: 'Back to customers', list: 'admin-customers' },
  ADMIN: { title: 'Add an admin', submit: 'Create admin', back: 'Back to admins', list: 'admin-admins' },
  RESTAURANT: {
    title: 'Add a restaurant', submit: 'Create restaurant', back: 'Back to restaurants', list: 'admin-restaurants',
    intro: 'The owner gets an account and the restaurant starts awaiting approval, like any new restaurant.',
  },
};
const copy = computed(() => COPY[props.role]);
const isRestaurant = computed(() => props.role === 'RESTAURANT');
const isCustomer = computed(() => props.role === 'CUSTOMER');

const ui = useUiStore();
const creating = ref(false);
const localErrors = ref({});
const blank = () => ({ fullName: '', email: '', phone: '', restaurantName: '' });
const form = ref(blank());
/** A customer's optional first address; left blank, none is created. */
const blankAddress = () => ({ label: '', line1: '', line2: '', city: '', district: '' });
const address = ref(blankAddress());
const hasAddress = computed(() => isCustomer.value && Object.values(address.value).some((v) => v.trim()));
/** Shown exactly once, here: it is never retrievable again. */
const issuedPassword = ref(null);

/** Only the fields filled in; the server drops nothing it is not sent. */
const addressPayload = () => Object.fromEntries(
  Object.entries(address.value).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v),
);

async function create() {
  const addressErrors = hasAddress.value
    ? validate(address.value, {
      line1: [rules.required('Street address'), rules.minLength(5, 'Street address')],
      city: [rules.required('City'), rules.minLength(2, 'City')],
    })
    : {};
  localErrors.value = {
    ...validate(form.value, {
      ...(isRestaurant.value ? { restaurantName: [rules.required('Restaurant name'), rules.minLength(2, 'Restaurant name')] } : {}),
      fullName: [rules.required('Name'), rules.minLength(2, 'Name')],
      email: [rules.required('Email'), rules.email],
      phone: [rules.required('Phone'), rules.phone],
    }),
    ...(addressErrors.line1 && { addressLine1: addressErrors.line1 }),
    ...(addressErrors.city && { addressCity: addressErrors.city }),
  };
  if (Object.keys(localErrors.value).length) return;

  creating.value = true;
  try {
    const { restaurantName, ...rest } = form.value;
    const { data } = await adminApi.createUser({
      role: props.role, ...rest,
      ...(isRestaurant.value ? { restaurantName } : {}),
      ...(hasAddress.value ? { address: addressPayload() } : {}),
    });
    issuedPassword.value = { email: data.user.email, password: data.initialPassword };
    form.value = blank();
    address.value = blankAddress();
    ui.toastSuccess('Account created');
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
    <h1 class="text-xl font-semibold text-slate-900">{{ t(copy.title) }}</h1>
    <p v-if="copy.intro" class="mt-1 text-sm text-slate-600">{{ t(copy.intro) }}</p>

    <div v-if="issuedPassword"
         class="card mt-4 border-emerald-300 bg-emerald-50 p-4 text-sm" role="status">
      <p class="font-medium text-emerald-900">{{ t('Account created') }}</p>
      <p class="mt-1 text-emerald-900">
        {{ t('Give these details to the account holder now. The password is shown only once and cannot be retrieved later.') }}
      </p>
      <p class="mt-2 select-all font-mono text-emerald-950">
        {{ issuedPassword.email }}<br>{{ issuedPassword.password }}
      </p>
      <button type="button" class="mt-2 text-xs underline" @click="issuedPassword = null">
        {{ t('I have saved it') }}
      </button>
    </div>

    <form class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="create">
      <AppInput v-if="isRestaurant" id="na-restaurant" v-model="form.restaurantName" label="Restaurant name" required
                :error="localErrors.restaurantName" />
      <AppInput id="na-name" v-model="form.fullName" :label="isRestaurant ? 'Owner name' : 'Full name'" required
                :error="localErrors.fullName" />
      <AppInput id="na-email" v-model="form.email" label="Email" type="email" required :error="localErrors.email" />
      <AppInput id="na-phone" v-model="form.phone" label="Phone" required :error="localErrors.phone" />

      <fieldset v-if="isCustomer" class="space-y-4 border-t border-slate-200 pt-4">
        <legend class="font-semibold text-slate-900">{{ t('Delivery address (optional)') }}</legend>
        <p class="text-xs text-slate-500">
          {{ t('Fill in at least the street and city to save it as their default address.') }}
        </p>
        <AppInput id="na-addr-label" v-model="address.label" label="Label" placeholder="Home, Work" />
        <AppInput id="na-addr-line1" v-model="address.line1" label="Street address" :error="localErrors.addressLine1" />
        <AppInput id="na-addr-line2" v-model="address.line2" label="Apartment, floor (optional)" />
        <div class="grid grid-cols-2 gap-3">
          <AppInput id="na-addr-city" v-model="address.city" label="City" :error="localErrors.addressCity" />
          <AppInput id="na-addr-district" v-model="address.district" label="District" />
        </div>
      </fieldset>

      <AppButton type="submit" :loading="creating">{{ t(copy.submit) }}</AppButton>
    </form>

    <RouterLink :to="{ name: copy.list }" class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
      {{ t(copy.back) }}
    </RouterLink>
  </div>
</template>
