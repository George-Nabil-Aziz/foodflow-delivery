<script setup>
import { ref, defineAsyncComponent } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';
import { useCartStore } from '../../stores/cart.store.js';
import { useFormErrors } from '../../composables/useFormErrors.js';
import { rules, validate } from '../../composables/useValidation.js';
import { homeFor } from '../../router/index.js';
import AppInput from '../../components/shared/AppInput.vue';
import AppButton from '../../components/shared/AppButton.vue';
import { t } from '../../i18n/index.js';
// Compile-time constant: false in a production build. The panel is loaded
// through a dynamic import inside the dead branch, so Vite drops both the
// component and its placeholder passwords from the bundle entirely - a static
// import would ship them even behind v-if.
const isDev = import.meta.env.DEV;
const DevAccounts = import.meta.env.DEV
  ? defineAsyncComponent(() => import('../../components/shared/DevAccounts.vue'))
  : null;

function signInAs({ email, password }) {
  form.value = { email, password };
  localErrors.value = {};
  submit();
}

const auth = useAuthStore();
const cart = useCartStore();
const route = useRoute();
const router = useRouter();
const { formError, capture, clear, fieldError } = useFormErrors();

const form = ref({ email: '', password: '' });
const localErrors = ref({});
const submitting = ref(false);

const schema = {
  email: [rules.required('Email'), rules.email],
  password: [rules.required('Password')],
};

function validateField(field) {
  const result = validate(form.value, { [field]: schema[field] });
  localErrors.value = { ...localErrors.value, [field]: result[field] ?? null };
}

async function submit() {
  clear();
  localErrors.value = validate(form.value, schema);
  // Client validation is for latency, not safety: it avoids a round trip.
  if (Object.keys(localErrors.value).length) return;

  submitting.value = true;
  try {
    const session = await auth.login(form.value);
    if (session.user.role === 'CUSTOMER') await cart.load().catch(() => {});
    // Honour ?redirect= so a guarded deep link lands where it was going.
    const redirect = route.query.redirect;
    router.push(redirect ? String(redirect) : homeFor(session.user.role));
  } catch (err) {
    capture(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="card p-6">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Sign in') }}</h1>
    <p class="mt-1 text-sm text-slate-600">{{ t('Welcome back to FoodFlow.') }}</p>

    <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
      <p v-if="formError" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        {{ t(formError) }}
      </p>

      <AppInput id="login-email" v-model="form.email" label="Email" type="email" required
                :error="localErrors.email || fieldError('email')" @blur="validateField('email')" />

      <AppInput id="login-password" v-model="form.password" label="Password" type="password" required
                :error="localErrors.password || fieldError('password')" @blur="validateField('password')" />

      <AppButton type="submit" class="w-full" :loading="submitting">{{ t('Sign in') }}</AppButton>
    </form>

    <p class="mt-6 text-center text-sm text-slate-600">
      {{ t('New to FoodFlow?') }}
      <RouterLink to="/register" class="action-link font-medium text-brand-700 hover:underline">{{ t('Create an account') }}</RouterLink>
    </p>

    <DevAccounts v-if="isDev" @pick="signInAs" />
  </div>
</template>
