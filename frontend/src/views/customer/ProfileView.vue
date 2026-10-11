<script setup>
import { onMounted, ref } from 'vue';
import { authApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { useFormErrors } from '../../composables/useFormErrors.js';
import { rules, validate } from '../../composables/useValidation.js';
import AppInput from '../../components/shared/AppInput.vue';
import AppButton from '../../components/shared/AppButton.vue';
import { t } from '../../i18n/index.js';

const auth = useAuthStore();
const ui = useUiStore();
const { capture, clear, fieldError } = useFormErrors();

const form = ref({ fullName: '', phone: '' });
const passwordForm = ref({ currentPassword: '', newPassword: '' });
const localErrors = ref({});
const passwordErrors = ref({});
const saving = ref(false);
const changing = ref(false);

onMounted(async () => {
  const data = await auth.loadMe();
  form.value = { fullName: data.user.fullName, phone: data.user.phone };
});

async function save() {
  clear();
  localErrors.value = validate(form.value, {
    fullName: [rules.required('Name'), rules.minLength(2, 'Name')],
    phone: [rules.required('Phone'), rules.phone],
  });
  if (Object.keys(localErrors.value).length) return;

  saving.value = true;
  try {
    const { data } = await authApi.updateMe(form.value);
    auth.setSession({ user: data.user });
    ui.toastSuccess('Profile updated');
  } catch (err) {
    capture(err);
    ui.toastError(err.message);
  } finally {
    saving.value = false;
  }
}

async function changePassword() {
  passwordErrors.value = validate(passwordForm.value, {
    currentPassword: [rules.required('Current password')],
    newPassword: [rules.required('New password'), rules.password],
  });
  if (Object.keys(passwordErrors.value).length) return;

  changing.value = true;
  try {
    await authApi.changePassword(passwordForm.value);
    passwordForm.value = { currentPassword: '', newPassword: '' };
    // Changing a password revokes every session, including this one, so the
    // honest thing to do is sign the user out rather than let them hit a 401.
    ui.toastSuccess('Password changed. Please sign in again.');
    await auth.logout();
    window.location.assign('/login');
  } catch (err) {
    passwordErrors.value = { currentPassword: err.message };
  } finally {
    changing.value = false;
  }
}
</script>

<template>
  <div class="max-w-xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Profile') }}</h1>

    <form class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="save">
      <h2 class="font-semibold text-slate-900">{{ t('Your details') }}</h2>
      <AppInput id="profile-name" v-model="form.fullName" label="Name" required
                :error="localErrors.fullName || fieldError('fullName')" />
      <AppInput id="profile-phone" v-model="form.phone" label="Phone" required
                :error="localErrors.phone || fieldError('phone')" />
      <p class="text-sm text-slate-600">
        {{ t('Your email address cannot be changed.') }}
        <span class="block font-medium text-slate-800">{{ auth.user?.email }}</span>
      </p>
      <AppButton type="submit" :loading="saving">{{ t('Save changes') }}</AppButton>
    </form>

    <form class="card mt-6 space-y-4 p-4" novalidate @submit.prevent="changePassword">
      <h2 class="font-semibold text-slate-900">{{ t('Change password') }}</h2>
      <AppInput id="current-password" v-model="passwordForm.currentPassword" type="password"
                label="Current password" required :error="passwordErrors.currentPassword" />
      <AppInput id="new-password" v-model="passwordForm.newPassword" type="password"
                label="New password" required
                hint="At least 8 characters, with a letter and a digit. All your sessions will end."
                :error="passwordErrors.newPassword" />
      <AppButton type="submit" variant="secondary" :loading="changing">{{ t('Change password') }}</AppButton>
    </form>
  </div>
</template>
