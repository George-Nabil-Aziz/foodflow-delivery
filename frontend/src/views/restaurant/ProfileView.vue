<script setup>
import { onMounted, ref } from 'vue';
import { restaurantApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { useFormErrors } from '../../composables/useFormErrors.js';
import { rules, validate } from '../../composables/useValidation.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import AppInput from '../../components/shared/AppInput.vue';
import AppButton from '../../components/shared/AppButton.vue';

const auth = useAuthStore();
const ui = useUiStore();
const { capture, clear, fieldError } = useFormErrors();

const CUISINES = [
  'EGYPTIAN', 'LEVANTINE', 'ITALIAN', 'INDIAN', 'BURGERS', 'SEAFOOD',
  'ASIAN', 'DESSERTS', 'COFFEE', 'HEALTHY', 'OTHER',
];

const profile = ref(null);
const form = ref({});
const loading = ref(true);
const saving = ref(false);
const localErrors = ref({});

async function load() {
  loading.value = true;
  try {
    profile.value = (await restaurantApi.profile()).data;
    form.value = {
      name: profile.value.name,
      description: profile.value.description ?? '',
      cuisineType: profile.value.cuisineType,
      phone: profile.value.phone ?? '',
      email: profile.value.email ?? '',
      logoUrl: profile.value.logoUrl ?? '',
      coverImageUrl: profile.value.coverImageUrl ?? '',
      addressLine1: profile.value.addressLine1 ?? '',
      city: profile.value.city ?? '',
      district: profile.value.district ?? '',
      deliveryFee: profile.value.deliveryFee,
      minimumOrderAmount: profile.value.minimumOrderAmount,
      avgPreparationMinutes: profile.value.avgPreparationMinutes,
      deliveryRadiusKm: profile.value.deliveryRadiusKm,
      latitude: profile.value.latitude ?? '',
      longitude: profile.value.longitude ?? '',
    };
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function save() {
  clear();
  localErrors.value = validate(form.value, {
    name: [rules.required('Name'), rules.minLength(2, 'Name'), rules.maxLength(120, 'Name')],
    phone: [rules.phone],
    deliveryRadiusKm: [(v) => (Number(v) >= 1 && Number(v) <= 30 ? null : 'Delivery radius must be between 1 and 30 km')],
  });
  if (Object.keys(localErrors.value).length) return;

  saving.value = true;
  try {
    // Only fields the owner is allowed to change are sent; status and rating
    // are not in this form at all, so they cannot be smuggled through.
    const payload = Object.fromEntries(
      Object.entries(form.value).filter(([, value]) => value !== '' && value !== null),
    );
    profile.value = (await restaurantApi.updateProfile(payload)).data;
    auth.setSession({ restaurant: { ...profile.value } });
    ui.toastSuccess('Profile saved');
  } catch (err) {
    capture(err);
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Restaurant profile') }}</h1>

    <AppSpinner v-if="loading" label="Loading profile" />

    <form v-else class="card mt-4 space-y-5 p-5" novalidate @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <AppInput id="r-name" v-model="form.name" label="Restaurant name" required
                  :error="localErrors.name || fieldError('name')" />

        <div>
          <label for="r-cuisine" class="field-label">{{ t('Cuisine') }}</label>
          <select id="r-cuisine" v-model="form.cuisineType" class="field-input">
            <option v-for="c in CUISINES" :key="c" :value="c">{{ t(c.toLowerCase()) }}</option>
          </select>
        </div>

        <AppInput id="r-phone" v-model="form.phone" label="Phone"
                  :error="localErrors.phone || fieldError('phone')" />
        <AppInput id="r-email" v-model="form.email" label="Contact email" type="email"
                  :error="fieldError('email')" />
      </div>

      <div>
        <label for="r-description" class="field-label">{{ t('Description') }}</label>
        <textarea id="r-description" v-model="form.description" rows="3" maxlength="2000"
                  class="field-input" />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <AppInput id="r-logo" v-model="form.logoUrl" label="Logo URL"
                  hint="Must start with http:// or https://" :error="fieldError('logoUrl')" />
        <AppInput id="r-cover" v-model="form.coverImageUrl" label="Cover image URL"
                  :error="fieldError('coverImageUrl')" />
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <AppInput id="r-address" v-model="form.addressLine1" label="Street address"
                  :error="fieldError('addressLine1')" />
        <AppInput id="r-city" v-model="form.city" label="City" :error="fieldError('city')" />
        <AppInput id="r-district" v-model="form.district" label="District" :error="fieldError('district')" />
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <AppInput id="r-fee" v-model="form.deliveryFee" label="Delivery fee"
                  :error="fieldError('deliveryFee')" />
        <AppInput id="r-min" v-model="form.minimumOrderAmount" label="Minimum order"
                  :error="fieldError('minimumOrderAmount')" />
        <AppInput id="r-prep" v-model="form.avgPreparationMinutes" label="Prep time (minutes)"
                  type="number" hint="Between 5 and 180"
                  :error="fieldError('avgPreparationMinutes')" />
      </div>

      <!-- The delivery zone: a circle around the restaurant (spec-18). -->
      <div class="grid gap-4 sm:grid-cols-3">
        <AppInput id="r-radius" v-model="form.deliveryRadiusKm" label="Delivery radius (km)"
                  type="number" hint="Between 1 and 30"
                  :error="localErrors.deliveryRadiusKm || fieldError('deliveryRadiusKm')" />
        <AppInput id="r-lat" v-model="form.latitude" label="Latitude" type="number"
                  hint="Needed to check customers' addresses against your delivery radius"
                  :error="fieldError('latitude')" />
        <AppInput id="r-lng" v-model="form.longitude" label="Longitude" type="number"
                  :error="fieldError('longitude')" />
      </div>

      <div class="flex items-center gap-3">
        <AppButton type="submit" :loading="saving">{{ t('Save profile') }}</AppButton>
        <p class="text-sm text-slate-600">
          {{ t('Status:') }} <strong>{{ t(profile?.status) }}</strong> &mdash; {{ t('only FoodFlow can change this.') }}
        </p>
      </div>
    </form>
  </div>
</template>
