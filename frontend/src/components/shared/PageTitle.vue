<script setup>
import { t } from '../../i18n/index.js';

/** A list page's title with how many rows the current filter matches beside it. */
defineProps({
  title: { type: String, required: true },
  // null while loading, so a stale number never sits next to a new filter.
  count: { type: Number, default: null },
});
</script>

<template>
  <h1 class="flex items-center gap-2 text-xl font-semibold text-slate-900">
    {{ title }}
    <span v-if="count !== null"
          class="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600"
          :aria-label="t('{count} results', { count })">
      {{ count }}
    </span>
  </h1>
</template>
