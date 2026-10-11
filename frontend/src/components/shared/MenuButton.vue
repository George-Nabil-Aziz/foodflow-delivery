<script setup>
import { t } from '../../i18n/index.js';

defineProps({ expanded: { type: Boolean, default: false } });
defineEmits(['toggle']);
</script>

<template>
  <button type="button"
          class="nav-link inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-700
                 transition-colors hover:bg-slate-100 hover:text-slate-900"
          :aria-label="t('Open menu')" :aria-expanded="expanded" aria-haspopup="dialog"
          @click="$emit('toggle')">
    <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  </button>
</template>
