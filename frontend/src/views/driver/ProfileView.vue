<script setup>
import { computed, onMounted, ref } from 'vue';
import { driverApi } from '../../services/api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useUiStore } from '../../stores/ui.store.js';
import { t } from '../../i18n/index.js';
import { enumText } from '../../utils/labels.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import AppInput from '../../components/shared/AppInput.vue';
import AppButton from '../../components/shared/AppButton.vue';

const auth = useAuthStore();
const ui = useUiStore();

const VEHICLES = ['BICYCLE', 'MOTORCYCLE', 'CAR'];
const profile = ref(null);
const form = ref({ vehicleType: 'MOTORCYCLE', vehiclePlate: '' });
const loading = ref(true);
const saving = ref(false);
const locating = ref(false);
const isBicycle = computed(() => form.value.vehicleType === 'BICYCLE');


async function load() {
  loading.value = true;
  try {
    profile.value = (await driverApi.profile()).data;
    form.value = {
      vehicleType: profile.value.vehicleType,
      vehiclePlate: profile.value.vehiclePlate ?? '',
    };
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function save() {
  saving.value = true;
  try {
    // A bicycle has no plate, so none is sent for one.
    const body = isBicycle.value ? { vehicleType: form.value.vehicleType } : form.value;
    profile.value = (await driverApi.updateProfile(body)).data;
    auth.setSession({ driverProfile: profile.value });
    ui.toastSuccess('Profile saved');
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    saving.value = false;
  }
}

/** Location is used only to rank dispatch candidates by distance. */
function shareLocation() {
  if (!navigator.geolocation) {
    ui.toastError('Your browser does not support location sharing.');
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        await driverApi.updateLocation({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
        ui.toastSuccess('Location updated');
        await load();
      } catch (err) {
        ui.toastError(err.message);
      } finally {
        locating.value = false;
      }
    },
    () => {
      locating.value = false;
      ui.toastError('We could not read your location.');
    },
  );
}
</script>

<template>
  <div class="max-w-xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Driver profile') }}</h1>

    <AppSpinner v-if="loading" label="Loading profile" />

    <template v-else-if="profile">
      <div class="card mt-4 p-4 text-sm">
        <p class="text-slate-600">{{ t('Account status') }}</p>
        <p class="font-medium text-slate-900">
          {{ enumText(profile.status) }}
        </p>
        <p class="mt-2 text-slate-600">{{ t('Rating') }}</p>
        <p class="font-medium text-slate-900">
          <template v-if="profile.ratingCount">
            {{ Number(profile.ratingAverage).toFixed(2) }} ({{ profile.ratingCount }})
          </template>
          <template v-else>{{ t('No ratings yet') }}</template>
        </p>
      </div>

      <form class="card mt-4 space-y-4 p-4" novalidate @submit.prevent="save">
        <h2 class="font-semibold text-slate-900">{{ t('Vehicle') }}</h2>
        <div>
          <label for="vehicle-type" class="field-label">{{ t('Vehicle type') }}</label>
          <select id="vehicle-type" v-model="form.vehicleType" class="field-input">
            <option v-for="v in VEHICLES" :key="v" :value="v">{{ enumText(v) }}</option>
          </select>
        </div>
        <AppInput v-if="!isBicycle" id="vehicle-plate" v-model="form.vehiclePlate" label="Plate number" required />
        <AppButton type="submit" :loading="saving">{{ t('Save') }}</AppButton>
      </form>

      <div class="card mt-4 p-4">
        <h2 class="font-semibold text-slate-900">{{ t('Location') }}</h2>
        <p class="mt-1 text-sm text-slate-600">
          {{ t('Sharing your location helps us offer you the nearest deliveries.') }}
        </p>
        <AppButton variant="secondary" class="mt-3" :loading="locating" @click="shareLocation">
          {{ t('Update my location') }}
        </AppButton>
      </div>
    </template>
  </div>
</template>
