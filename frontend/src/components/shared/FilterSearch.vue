<script setup>
import { t } from '../../i18n/index.js';

defineProps({
  id: { type: String, required: true },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="relative min-w-[9rem] flex-1 sm:max-w-xs">
    <label :for="id" class="sr-only">{{ t('Search') }}</label>
    <svg class="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
         viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
    <!-- ui-control-icon keeps room for the icon at every width. -->
    <input :id="id" type="search" class="ui-control ui-control-icon field-input w-full"
           :value="modelValue" :placeholder="placeholder"
           @input="$emit('update:modelValue', $event.target.value)">
  </div>
</template>
