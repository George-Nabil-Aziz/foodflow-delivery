<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';
import { useFormErrors } from '../../composables/useFormErrors.js';
import { rules, validate } from '../../composables/useValidation.js';
import { homeFor } from '../../router/index.js';
import AppInput from '../../components/shared/AppInput.vue';
import AppButton from '../../components/shared/AppButton.vue';
import { t } from '../../i18n/index.js';

const auth = useAuthStore();
const router = useRouter();
const { formError, capture, clear, fieldError } = useFormErrors();

// Only these two roles can self-register. Driver accounts are created by an
// administrator, because a driver receives a stranger's home address.
const form = ref({
  role: 'CUSTOMER', email: '', password: '', fullName: '', phone: '', restaurantName: '',
});
const localErrors = ref({});
const submitting = ref(false);

const isRestaurant = computed(() => form.value.role === 'RESTAURANT');

const schema = computed(() => ({
  fullName: [rules.required('Your name'), rules.minLength(2, 'Your name')],
  email: [rules.required('Email'), rules.email],
  password: [rules.required('Password'), rules.password],
  phone: [rules.required('Phone'), rules.phone],
  ...(isRestaurant.value
    ? { restaurantName: [rules.required('Restaurant name'), rules.minLength(2, 'Restaurant name')] }
    : {}),
}));

function validateField(field) {
  const result = validate(form.value, { [field]: schema.value[field] });
  localErrors.value = { ...localErrors.value, [field]: result[field] ?? null };
}

async function submit() {
  clear();
  localErrors.value = validate(form.value, schema.value);
  if (Object.keys(localErrors.value).length) return;

  submitting.value = true;
  try {
    const payload = { ...form.value };
    if (!isRestaurant.value) delete payload.restaurantName;
    const session = await auth.register(payload);
    router.push(homeFor(session.user.role));
  } catch (err) {
    capture(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="card p-6">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Create your account') }}</h1>

    <fieldset class="mt-4">
      <legend class="field-label">{{ t('I want to') }}</legend>
      <div class="grid grid-cols-2 gap-2">
        <label v-for="option in [
                 { value: 'CUSTOMER', label: 'Order food' },
                 { value: 'RESTAURANT', label: 'Run a restaurant' },
               ]" :key="option.value"
               class="cursor-pointer rounded-lg border px-3 py-3 text-center text-sm"
               :class="form.role === option.value
                 ? 'border-brand-500 bg-brand-50 font-medium text-brand-800'
                 : 'border-slate-300 bg-surface text-slate-700'">
          <input v-model="form.role" type="radio" :value="option.value" class="sr-only">
          {{ t(option.label) }}
        </label>
      </div>
    </fieldset>

    <form class="mt-5 space-y-4" novalidate @submit.prevent="submit">
      <p v-if="formError" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        {{ t(formError) }}
      </p>

      <AppInput id="reg-name" v-model="form.fullName" label="Your name" required
                :error="localErrors.fullName || fieldError('fullName')" @blur="validateField('fullName')" />

      <AppInput v-if="isRestaurant" id="reg-restaurant" v-model="form.restaurantName"
                label="Restaurant name" required
                hint="Your restaurant is reviewed by our team before customers can see it."
                :error="localErrors.restaurantName || fieldError('restaurantName')"
                @blur="validateField('restaurantName')" />

      <AppInput id="reg-email" v-model="form.email" label="Email" type="email" required
                :error="localErrors.email || fieldError('email')" @blur="validateField('email')" />

      <AppInput id="reg-phone" v-model="form.phone" label="Phone" placeholder="01012345678" required
                :error="localErrors.phone || fieldError('phone')" @blur="validateField('phone')" />

      <AppInput id="reg-password" v-model="form.password" label="Password" type="password" required
                hint="At least 8 characters, with a letter and a digit."
                :error="localErrors.password || fieldError('password')" @blur="validateField('password')" />

      <AppButton type="submit" class="w-full" :loading="submitting">{{ t('Create account') }}</AppButton>
    </form>

    <p class="mt-6 text-center text-sm text-slate-600">
      {{ t('Already have an account?') }}
      <RouterLink to="/login" class="action-link font-medium text-brand-700 hover:underline">{{ t('Sign in') }}</RouterLink>
    </p>
  </div>
</template>
