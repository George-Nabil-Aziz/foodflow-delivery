<script setup>
import ToastHost from './components/shared/ToastHost.vue';
import BackToTop from './components/shared/BackToTop.vue';
import { t } from './i18n/index.js';
</script>

<template>
  <div class="min-h-screen">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50
                           focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:shadow">
      {{ t('Skip to content') }}
    </a>
    <RouterView />
    <BackToTop />
    <ToastHost />
  </div>
</template>
