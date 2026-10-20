<script setup>
import { t } from '../../i18n/index.js';

/** Stands in for a deleted record's status: a deleted row has no live one. */
</script>

<template>
  <span class="rounded-full border border-slate-400 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
    {{ t('Deleted') }}
  </span>
</template>
