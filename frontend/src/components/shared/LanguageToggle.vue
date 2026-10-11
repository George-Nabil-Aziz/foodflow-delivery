<script setup>
import { computed } from 'vue';
import { locale, setLocale } from '../../i18n/index.js';

// Each option is written in its own language, so a reader who cannot read the
// current one can still find theirs.
const next = computed(() => (locale.value === 'ar'
  ? { code: 'en', label: 'English' }
  : { code: 'ar', label: 'العربية' }));
</script>

<template>
  <button type="button"
          class="nav-link inline-flex h-11 items-center md:h-9 gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-700
                 transition-colors hover:bg-slate-100 hover:text-slate-900"
          :lang="next.code"
          @click="setLocale(next.code)">
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
    {{ next.label }}
  </button>
</template>
