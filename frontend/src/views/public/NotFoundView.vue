<script setup>
import { RouterLink } from 'vue-router';
import { t } from '../../i18n/index.js';
</script>

<template>
  <div class="card mx-auto max-w-lg p-10 text-center">
    <h1 class="text-2xl font-bold text-slate-900">{{ t('Page not found') }}</h1>
    <p class="mt-2 text-slate-600">{{ t('We could not find that page. It may have moved.') }}</p>
    <RouterLink to="/" class="inline-flex min-h-11 items-center justify-center md:min-h-0 mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
      {{ t('Back to home') }}
    </RouterLink>
  </div>
</template>
