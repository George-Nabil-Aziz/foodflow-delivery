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

const ui = useUiStore();
const creating = ref(false);
const localErrors = ref({});
const blank = () => ({ fullName: '', email: '', phone: '', restaurantName: '' });
const form = ref(blank());
/** Shown exactly once, here: it is never retrievable again. */
const issuedPassword = ref(null);

async function create() {
  localErrors.value = validate(form.value, {
    ...(isRestaurant.value ? { restaurantName: [rules.required('Restaurant name'), rules.minLength(2, 'Restaurant name')] } : {}),
    fullName: [rules.required('Name'), rules.minLength(2, 'Name')],
    email: [rules.required('Email'), rules.email],
    phone: [rules.required('Phone'), rules.phone],
  });
  if (Object.keys(localErrors.value).length) return;

  creating.value = true;
  try {
    const { restaurantName, ...rest } = form.value;
    const { data } = await adminApi.createUser({
      role: props.role, ...rest, ...(isRestaurant.value ? { restaurantName } : {}),
    });
    issuedPassword.value = { email: data.user.email, password: data.initialPassword };
    form.value = blank();
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
      <AppButton type="submit" :loading="creating">{{ t(copy.submit) }}</AppButton>
    </form>

    <RouterLink :to="{ name: copy.list }" class="action-link mt-6 inline-block text-sm text-brand-700 hover:underline">
      {{ t(copy.back) }}
    </RouterLink>
  </div>
</template>
