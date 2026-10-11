<script setup>
import { computed } from 'vue';
import { useTheme } from '../../composables/useTheme.js';
import { t } from '../../i18n/index.js';

const { theme, toggleTheme } = useTheme();
const isDark = computed(() => theme.value === 'dark');
</script>

<template>
  <!--
    A toggle button with a fixed name and aria-pressed, so a screen reader
    announces "Dark mode, toggle button, pressed" rather than an icon.
  -->
  <button type="button"
          class="nav-link inline-flex h-11 w-11 items-center md:h-9 md:w-9 justify-center rounded-lg text-slate-600 transition-colors
                 hover:bg-slate-100 hover:text-slate-900"
          :aria-pressed="isDark"
          :aria-label="t('Dark mode')"
          :title="isDark ? t('Switch to light mode') : t('Switch to dark mode')"
          @click="toggleTheme">
    <!-- Moon while light (the action offered), sun while dark. -->
    <svg v-if="isDark" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
    <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </button>
</template>
