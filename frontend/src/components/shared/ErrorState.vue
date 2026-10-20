<script setup>
import { t } from '../../i18n/index.js';

defineProps({
  message: { type: String, default: 'Something went wrong.' },
  retryable: { type: Boolean, default: true },
});
defineEmits(['retry']);
</script>

<template>
  <div class="card border-red-200 bg-red-50 p-6 text-center" role="alert">
    <h3 class="text-base font-semibold text-red-900">{{ t('We could not load this') }}</h3>
    <p class="mt-1 text-sm text-red-800">{{ t(message) }}</p>
    <button
      v-if="retryable"
      type="button"
      class="ui-control inline-flex items-center justify-center mt-4 rounded-lg border border-red-300 bg-surface px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
      @click="$emit('retry')"
    >
      {{ t('Try again') }}
    </button>
  </div>
</template>
