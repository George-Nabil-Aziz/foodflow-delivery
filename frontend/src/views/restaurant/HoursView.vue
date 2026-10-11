<script setup>
import { onMounted, ref } from 'vue';
import { restaurantApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import { t } from '../../i18n/index.js';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import AppButton from '../../components/shared/AppButton.vue';

const ui = useUiStore();
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const hours = ref([]);
const loading = ref(true);
const saving = ref(false);
const errors = ref({});

const defaults = () => DAYS.map((_, dayOfWeek) => ({
  dayOfWeek, isClosed: false, opensAt: '11:00', closesAt: '23:00',
}));

async function load() {
  loading.value = true;
  try {
    const data = (await restaurantApi.hours()).data;
    hours.value = data.length === 7
      ? data.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          isClosed: h.isClosed,
          opensAt: h.opensAt ?? '11:00',
          closesAt: h.closesAt ?? '23:00',
        }))
      : defaults();
  } catch (err) {
    ui.toastError(err.message);
    hours.value = defaults();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** Copies the first open day to every other day. */
function copyToAll() {
  const source = hours.value.find((h) => !h.isClosed) ?? hours.value[0];
  hours.value = hours.value.map((h) => ({
    ...h, opensAt: source.opensAt, closesAt: source.closesAt, isClosed: false,
  }));
}

/**
 * Client-side mirror of the server rules: all seven days, and a close time
 * later than the open time. Overnight hours are not supported in this version.
 */
function validateLocally() {
  const next = {};
  for (const day of hours.value) {
    if (day.isClosed) continue;
    if (!day.opensAt || !day.closesAt) {
      next[day.dayOfWeek] = 'Set both an opening and a closing time, or mark the day closed.';
    } else if (day.closesAt <= day.opensAt) {
      next[day.dayOfWeek] =
        'Closing must be later than opening. Overnight hours are not supported yet; use 23:59.';
    }
  }
  errors.value = next;
  return Object.keys(next).length === 0;
}

async function save() {
  if (!validateLocally()) return;
  saving.value = true;
  try {
    // The whole week is always submitted: a partial update makes "clear
    // Tuesday" and "do not touch Tuesday" indistinguishable.
    await restaurantApi.replaceHours(hours.value);
    ui.toastSuccess('Opening hours saved');
    await load();
  } catch (err) {
    const detail = err.details?.[0];
    ui.toastError(detail?.issue ?? err.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="text-xl font-semibold text-slate-900">{{ t('Opening hours') }}</h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ t('Customers can only order while you are open. All seven days are saved together.') }}
    </p>

    <AppSpinner v-if="loading" label="Loading hours" />

    <form v-else class="card mt-4 p-4" novalidate @submit.prevent="save">
      <ul class="divide-y divide-slate-200">
        <li v-for="day in hours" :key="day.dayOfWeek" class="py-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="w-28 font-medium text-slate-800">{{ t(DAYS[day.dayOfWeek]) }}</span>

            <label class="flex items-center gap-2 text-sm">
              <input v-model="day.isClosed" type="checkbox"> {{ t('Closed') }}
            </label>

            <template v-if="!day.isClosed">
              <label :for="`open-${day.dayOfWeek}`" class="sr-only">
                {{ t('{day} opening time', { day: t(DAYS[day.dayOfWeek]) }) }}
              </label>
              <input :id="`open-${day.dayOfWeek}`" v-model="day.opensAt" type="time"
                     class="field-input w-32">
              <span class="text-slate-500" aria-hidden="true">{{ t('to') }}</span>
              <label :for="`close-${day.dayOfWeek}`" class="sr-only">
                {{ t('{day} closing time', { day: t(DAYS[day.dayOfWeek]) }) }}
              </label>
              <input :id="`close-${day.dayOfWeek}`" v-model="day.closesAt" type="time"
                     class="field-input w-32">
            </template>
          </div>
          <p v-if="errors[day.dayOfWeek]" class="field-error">{{ t(errors[day.dayOfWeek]) }}</p>
        </li>
      </ul>

      <div class="mt-4 flex gap-2">
        <AppButton type="submit" :loading="saving">{{ t('Save hours') }}</AppButton>
        <AppButton variant="secondary" @click="copyToAll">{{ t('Copy first open day to all') }}</AppButton>
      </div>
    </form>
  </div>
</template>
