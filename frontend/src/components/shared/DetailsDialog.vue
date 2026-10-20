<script setup>
import { ref } from 'vue';
import AppButton from './AppButton.vue';
import AppSpinner from './AppSpinner.vue';
import { useFocusTrap } from '../../composables/useFocusTrap.js';
import { t } from '../../i18n/index.js';

/**
 * Everything about one table row, read-only. The table shows a few columns;
 * this shows the rest. Each field is { label, value }, both already translated;
 * an empty value reads as a dash rather than vanishing, so a missing phone is
 * visibly missing. The default slot adds anything that is not a label/value
 * pair (an order's items).
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  fields: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const dialogRef = ref(null);
useFocusTrap(dialogRef, () => props.open, () => emit('close'));

const isEmpty = (value) => value === null || value === undefined || value === '';
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
       @click.self="emit('close')">
    <div ref="dialogRef" tabindex="-1" role="dialog" aria-modal="true" :aria-label="title"
         class="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl sm:p-6">
      <h2 class="text-lg font-semibold text-slate-900">{{ title }}</h2>

      <AppSpinner v-if="loading" class="mt-4" label="Loading details" />
      <template v-else>
        <dl class="mt-4 divide-y divide-slate-100 text-sm">
          <div v-for="field in fields" :key="field.label" class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2">
            <dt class="text-slate-500">{{ field.label }}</dt>
            <!-- A field with a `slot` name renders through that named slot (stars, a link). -->
            <dd class="break-words text-slate-900">
              <slot v-if="field.slot && !isEmpty(field.value)" :name="field.slot" :value="field.value" />
              <template v-else>{{ isEmpty(field.value) ? '—' : field.value }}</template>
            </dd>
          </div>
        </dl>
        <slot />
      </template>

      <div class="mt-6 flex justify-end">
        <AppButton variant="secondary" @click="emit('close')">{{ t('Close') }}</AppButton>
      </div>
    </div>
  </div>
</template>
