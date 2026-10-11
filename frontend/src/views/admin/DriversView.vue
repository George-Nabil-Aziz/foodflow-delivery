<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { adminApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { rules, validate } from '../../composables/useValidation.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import AppButton from '../../components/shared/AppButton.vue';
import AppInput from '../../components/shared/AppInput.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const route = useRoute();
const ui = useUiStore();

const drivers = ref([]);
const loading = ref(true);
const busy = ref(null);
const creating = ref(false);
const statusFilter = ref(route.query.status ?? '');
const localErrors = ref({});
const dialog = ref({ open: false, config: {}, driver: null });

const blank = () => ({ email: '', fullName: '', phone: '', vehicleType: 'MOTORCYCLE', vehiclePlate: '' });
const form = ref(blank());
/** Shown exactly once, here: it is never retrievable again. */
const issuedPassword = ref(null);

/** An enum as it has always read ("on delivery"), translated in Arabic. */
const enumText = (value) => t(value.replaceAll('_', ' ').toLowerCase());

async function load() {
  loading.value = true;
  try {
    const params = { limit: 50 };
    if (statusFilter.value) params.status = statusFilter.value;
    drivers.value = (await adminApi.drivers(params)).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const pending = computed(() => drivers.value.filter((d) => d.status === 'PENDING_APPROVAL'));

async function create() {
  localErrors.value = validate(form.value, {
    fullName: [rules.required('Name'), rules.minLength(2, 'Name')],
    email: [rules.required('Email'), rules.email],
    phone: [rules.required('Phone'), rules.phone],
    vehiclePlate: [rules.required('Plate'), rules.minLength(2, 'Plate')],
  });
  if (Object.keys(localErrors.value).length) return;

  creating.value = true;
  try {
    const { data } = await adminApi.createDriver(form.value);
    issuedPassword.value = { email: data.user.email, password: data.initialPassword };
    form.value = blank();
    ui.toastSuccess('Driver account created');
    await load();
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

async function approve(driver) {
  busy.value = driver.userId;
  try {
    await adminApi.approveDriver(driver.userId);
    ui.toastSuccess(t('{name} approved', { name: driver.fullName }));
    await load();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

function askSuspend(driver) {
  dialog.value = {
    open: true,
    driver,
    config: {
      title: t('Suspend {name}?', { name: driver.fullName }),
      message: 'A driver who is currently on a delivery cannot be suspended: the order is already in their vehicle.',
      confirmLabel: 'Suspend driver',
      requireReason: true,
      variant: 'danger',
    },
  };
}

async function confirmSuspend({ reason }) {
  const driver = dialog.value.driver;
  dialog.value = { ...dialog.value, open: false };
  busy.value = driver.userId;
  try {
    await adminApi.suspendDriver(driver.userId, reason);
    ui.toastSuccess('Driver suspended');
    await load();
  } catch (err) {
    ui.toastError(err.details?.[0]?.issue ?? err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-3">
    <section class="min-w-0 xl:col-span-2">
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Drivers') }}</h1>

      <div class="card mt-4 p-4 sm:max-w-xs">
        <label for="d-status" class="field-label">{{ t('Status') }}</label>
        <select id="d-status" v-model="statusFilter" class="field-input" @change="load">
          <option value="">{{ t('All statuses') }}</option>
          <option v-for="s in ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED']" :key="s" :value="s">
            {{ enumText(s) }}
          </option>
        </select>
      </div>

      <AppSpinner v-if="loading" label="Loading drivers" />
      <EmptyState v-else-if="drivers.length === 0" class="mt-4" title="No drivers match this filter" />

      <template v-else>
        <div v-if="pending.length" class="mt-6">
          <h2 class="text-lg font-semibold text-slate-900">{{ t('Awaiting approval ({count})', { count: pending.length }) }}</h2>
          <ul class="mt-3 space-y-2">
            <li v-for="d in pending" :key="d.id" class="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div class="min-w-0">
                <p class="font-medium text-slate-900">{{ d.fullName }}</p>
                <p class="break-words text-sm text-slate-600">{{ d.email }} &middot; {{ enumText(d.vehicleType) }} {{ d.vehiclePlate }}</p>
              </div>
              <AppButton size="sm" :disabled="busy === d.userId" @click="approve(d)">{{ t('Approve') }}</AppButton>
            </li>
          </ul>
        </div>

        <div class="card table-wrap mt-6 overflow-x-auto">
          <table class="table-cards w-full text-start text-sm">
            <thead class="border-b border-slate-200 text-slate-600">
              <tr>
                <th scope="col" class="p-3">{{ t('Driver') }}</th>
                <th scope="col" class="p-3">{{ t('Status') }}</th>
                <th scope="col" class="p-3">{{ t('Availability') }}</th>
                <th scope="col" class="p-3">{{ t('Rating') }}</th>
                <th scope="col" class="p-3">{{ t('Actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in drivers" :key="d.id" class="border-b border-slate-100 last:border-0">
                <td :data-label="t('Driver')" class="p-3">
                  <span class="font-medium text-slate-900">{{ d.fullName }}</span>
                  <span class="block text-xs text-slate-500">{{ d.email }}</span>
                </td>
                <td :data-label="t('Status')" class="p-3">{{ enumText(d.status) }}</td>
                <td :data-label="t('Availability')" class="p-3">{{ enumText(d.availability) }}</td>
                <td :data-label="t('Rating')" class="p-3">
                  <template v-if="d.ratingCount">{{ Number(d.ratingAverage).toFixed(2) }} ({{ d.ratingCount }})</template>
                  <template v-else><span class="text-slate-500">{{ t('unrated') }}</span></template>
                </td>
                <td :data-label="t('Actions')" class="p-3">
                  <button v-if="d.status === 'ACTIVE'" type="button" :disabled="busy === d.userId"
                          class="action-link text-red-700 hover:underline" @click="askSuspend(d)">
{{ t('Suspend') }}
</button>
                  <button v-else-if="d.status === 'PENDING_APPROVAL'" type="button"
                          :disabled="busy === d.userId" class="action-link text-brand-700 hover:underline"
                          @click="approve(d)">
{{ t('Approve') }}
</button>
                  <span v-else class="text-slate-500">&mdash;</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <section>
      <h2 class="text-lg font-semibold text-slate-900">{{ t('Add a driver') }}</h2>
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
        <AppInput id="nd-plate" v-model="form.vehiclePlate" label="Plate number" required :error="localErrors.vehiclePlate" />
        <AppButton type="submit" :loading="creating">{{ t('Create driver') }}</AppButton>
      </form>
    </section>

    <ConfirmDialog :open="dialog.open" :config="dialog.config"
                   @accept="confirmSuspend" @cancel="dialog.open = false" />
  </div>
</template>
