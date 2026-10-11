<script setup>
import { ref, watch } from 'vue';
import AppButton from './AppButton.vue';
import { useFocusTrap } from '../../composables/useFocusTrap.js';
import { t } from '../../i18n/index.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  config: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['accept', 'cancel']);

const reason = ref('');
const reasonCode = ref('');
const dialogRef = ref(null);

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    reason.value = '';
    reasonCode.value = '';
  }
});

// Focus in on open, Tab cycles inside, Escape cancels, focus returns on close.
useFocusTrap(dialogRef, () => props.open, () => emit('cancel'));

// A reason is required before the destructive action is enabled, and the
// dialog names its specific consequence rather than asking "are you sure?".
const canConfirm = () => {
  if (props.config.reasonOptions?.length && !reasonCode.value) return false;
  if (!props.config.requireReason) return true;
  const length = reason.value.trim().length;
  return length >= 5 && length <= 300;
};
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
       @click.self="emit('cancel')">
    <div ref="dialogRef" tabindex="-1" role="dialog" aria-modal="true"
         :aria-label="t(config.title)" class="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-surface p-5 shadow-2xl sm:p-6">
      <h2 class="text-lg font-semibold text-slate-900">{{ t(config.title) }}</h2>
      <p v-if="config.message" class="mt-2 text-sm text-slate-700">{{ t(config.message) }}</p>

      <div v-if="config.reasonOptions?.length" class="mt-4">
        <label for="confirm-reason-code" class="field-label">{{ t('Reason (required)') }}</label>
        <select id="confirm-reason-code" v-model="reasonCode" class="field-input">
          <option value="">{{ t('Choose a reason') }}</option>
          <option v-for="option in config.reasonOptions" :key="option.value" :value="option.value">
            {{ t(option.label) }}
          </option>
        </select>
      </div>

      <div v-if="config.requireReason" class="mt-4">
        <label for="confirm-reason" class="field-label">
          {{ config.reasonOptions?.length ? t('Note (required)') : t('Reason (required)') }}
        </label>
        <textarea id="confirm-reason" v-model="reason" rows="3" class="field-input"
                  :placeholder="t('Explain why, in at least 5 characters')" />
      </div>

      <!-- Stacked full-width on a phone, the safe choice on top of the thumb. -->
      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <AppButton variant="secondary" @click="emit('cancel')">
          {{ t(config.cancelLabel || 'Cancel') }}
        </AppButton>
        <AppButton :variant="config.variant || 'danger'" :disabled="!canConfirm()"
                   @click="emit('accept', { reason, reasonCode })">
          {{ t(config.confirmLabel || 'Confirm') }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
