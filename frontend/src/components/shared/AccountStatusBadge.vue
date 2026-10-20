<script setup>
import { computed } from 'vue';
import { enumText } from '../../utils/labels.js';

/**
 * The status of an account, restaurant or driver as a coloured pill, the same
 * colours on every admin list: active green, waiting amber, suspended red,
 * rejected grey. The word is always shown; the colour only reinforces it.
 */
const props = defineProps({ status: { type: String, required: true } });

const TONE = {
  ACTIVE: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  PENDING_APPROVAL: 'border-amber-300 bg-amber-50 text-amber-900',
  SUSPENDED: 'border-red-300 bg-red-50 text-red-900',
  REJECTED: 'border-slate-400 bg-slate-100 text-slate-800',
};
const tone = computed(() => TONE[props.status] ?? TONE.REJECTED);
</script>

<template>
  <span class="inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium" :class="tone">
    {{ enumText(status) }}
  </span>
</template>
