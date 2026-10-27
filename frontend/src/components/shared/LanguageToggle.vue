<script setup>
import { computed } from 'vue';
import { locale, setLocale } from '../../i18n/index.js';
import { useAuthStore } from '../../stores/auth.store.js';

const auth = useAuthStore();

function switchTo(code) {
  setLocale(code);
  auth.saveLanguage(code);
}

// An icon only. Its name is written in the language it switches to, so a
// reader who cannot read the current one can still find theirs.
const next = computed(() => (locale.value === 'ar'
  ? { code: 'en', label: 'Switch to English' }
  : { code: 'ar', label: 'التبديل إلى العربية' }));
</script>

<template>
  <button type="button"
          class="nav-link inline-flex h-[1.875rem] w-[1.875rem] shrink-0 items-center justify-center rounded-lg text-slate-600
                 transition-colors hover:bg-slate-100 hover:text-slate-900 md:h-9 md:w-9"
          :lang="next.code" :aria-label="next.label" :title="next.label"
          @click="switchTo(next.code)">
    <svg class="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  </button>
</template>
