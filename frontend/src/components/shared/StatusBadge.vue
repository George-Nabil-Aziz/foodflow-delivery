<script setup>
import { computed } from 'vue';
import { STATUS_LABEL, STATUS_CLASS } from '../../utils/orderStatus.js';
import { t } from '../../i18n/index.js';

const props = defineProps({ status: { type: String, required: true } });

// Colour AND text, always: status is never conveyed by colour alone (NFR-14).
const label = computed(() => t(STATUS_LABEL[props.status] ?? props.status));
const classes = computed(() => STATUS_CLASS[props.status] ?? 'bg-slate-100 text-slate-800 border-slate-300');
</script>

<template>
  <span :class="`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`">
    {{ label }}
  </span>
</template>
