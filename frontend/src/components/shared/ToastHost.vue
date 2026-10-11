<script setup>
import { useUiStore } from '../../stores/ui.store.js';
import { t } from '../../i18n/index.js';
const ui = useUiStore();
const tone = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-slate-900 text-slate-50',
};
</script>

<template>
  <!--
    Pinned to both edges on a phone instead of `w-full` with a right offset:
    a full-viewport-width box offset from the right hangs 16px off the left
    edge and widens the document, which scrolls the whole page sideways.
  -->
  <div class="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:start-auto sm:end-4 sm:w-full sm:max-w-sm"
       aria-live="polite" aria-atomic="false">
    <div v-for="toast in ui.toasts" :key="toast.id"
         :class="`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm shadow-raised ring-1 ring-black/5 ${tone[toast.variant]}`">
      <span>{{ t(toast.message) }}</span>
      <button type="button" class="opacity-80 hover:opacity-100" :aria-label="t('Dismiss notification')"
              @click="ui.dismiss(toast.id)">
&times;
</button>
    </div>
  </div>
</template>
