<script setup>
import { t } from '../../i18n/index.js';

/**
 * A given rating as lit stars only: 3 shows three stars, nothing else. The
 * stars are decoration; the number is in the accessible name, so a screen
 * reader hears "3 out of 5 stars" rather than nothing.
 */
defineProps({ value: { type: Number, required: true } });
</script>

<template>
  <span class="inline-flex items-center gap-0.5 align-middle text-amber-500" role="img"
        :aria-label="t('{n} out of 5 stars', { n: value })" :title="t('{n} out of 5 stars', { n: value })">
    <svg v-for="n in value" :key="n" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8L12 2.5z" />
    </svg>
  </span>
</template>
