<script setup>
import { computed } from 'vue';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_CLASS } from '../../utils/orderStatus.js';
import { t } from '../../i18n/index.js';

const props = defineProps({ status: { type: String, required: true } });

// Colour AND text, always (NFR-14).
const label = computed(() => t(PAYMENT_STATUS_LABEL[props.status] ?? props.status));
const classes = computed(() => PAYMENT_STATUS_CLASS[props.status] ?? 'bg-slate-100 text-slate-800 border-slate-300');
</script>

<template>
  <span :class="`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`">
    {{ label }}
  </span>
</template>
