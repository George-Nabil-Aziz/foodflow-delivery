<script setup>
import { onMounted, ref } from 'vue';
import { addressApi } from '../../services/api.js';
import { useUiStore } from '../../stores/ui.store.js';
import FilterBar from '../../components/shared/FilterBar.vue';
import AppSpinner from '../../components/shared/AppSpinner.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import { t } from '../../i18n/index.js';

const ui = useUiStore();

const addresses = ref([]);
const loading = ref(true);
const busy = ref(null);

async function load() {
  loading.value = true;
  try {
    addresses.value = (await addressApi.list()).data;
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function makeDefault(address) {
  busy.value = address.id;
  try {
    await addressApi.setDefault(address.id);
    await load();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}

async function remove(address) {
  busy.value = address.id;
  try {
    await addressApi.remove(address.id);
    ui.toast('Address removed');
    await load();
  } catch (err) {
    ui.toastError(err.message);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <section>
      <h1 class="text-xl font-semibold text-slate-900">{{ t('Delivery addresses') }}</h1>
      <FilterBar :add-to="{ name: 'address-new' }" :add-label="t('Add an address')" />

      <AppSpinner v-if="loading" label="Loading addresses" />

      <EmptyState v-else-if="addresses.length === 0" class="mt-4"
                  title="No addresses yet"
                  message="Add one so you can check out." />

      <ul v-else class="mt-4 space-y-3">
        <li v-for="address in addresses" :key="address.id" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-medium text-slate-900">
                {{ address.label || t('Address') }}
                <span v-if="address.isDefault"
                      class="ms-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                  {{ t('Default') }}
                </span>
              </p>
              <p class="mt-1 text-sm text-slate-600">
                {{ address.line1 }}<template v-if="address.line2">, {{ address.line2 }}</template><br>
                <template v-if="address.district">{{ address.district }}, </template>{{ address.city }}
              </p>
            </div>
            <div class="flex shrink-0 flex-col gap-1 text-end">
              <button v-if="!address.isDefault" type="button" :disabled="busy === address.id"
                      class="action-link text-xs text-brand-700 hover:underline" @click="makeDefault(address)">
                {{ t('Make default') }}
              </button>
              <button type="button" :disabled="busy === address.id"
                      class="action-link text-xs text-red-700 hover:underline" @click="remove(address)">
                {{ t('Remove') }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
