<script setup>
import { t } from '../../i18n/index.js';
import { formatDateTime } from '../../utils/datetime.js';

/** Stands in for a deleted record's status: a deleted row has no live one. */
defineProps({ at: { type: String, required: true } });
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
    <span class="rounded-full border border-slate-400 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
      {{ t('Deleted') }}
    </span>
    <span class="text-xs text-slate-500">{{ formatDateTime(at) }}</span>
  </span>
</template>
