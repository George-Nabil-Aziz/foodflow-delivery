<script setup>
import { computed } from 'vue';
import { formatMoney } from '../../utils/money.js';

const props = defineProps({
  amount: { type: [String, Number], default: '0.00' },
  emphasis: { type: Boolean, default: false },
});
const text = computed(() => formatMoney(props.amount));
</script>

<template>
  <span :class="emphasis ? 'font-semibold text-slate-900' : 'text-slate-700'">{{ text }}</span>
</template>
