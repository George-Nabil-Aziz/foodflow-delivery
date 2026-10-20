<script setup>
import { t } from '../../i18n/index.js';

defineEmits(['sign-out']);
</script>

<template>
  <!-- An icon only, sized like the language and theme toggles beside it. -->
  <button type="button"
          class="nav-link inline-flex h-[1.875rem] w-[1.875rem] shrink-0 items-center justify-center rounded-lg text-slate-600
                 transition-colors hover:bg-slate-100 hover:text-slate-900 md:h-9 md:w-9"
          :aria-label="t('Sign out')" :title="t('Sign out')"
          @click="$emit('sign-out')">
    <svg class="h-4 w-4 md:h-5 md:w-5 rtl:-scale-x-100" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  </button>
</template>
