<script setup>
import { computed } from 'vue';
import { ORDER_FLOW, STATUS_LABEL } from '../../utils/orderStatus.js';
import { formatTime } from '../../utils/datetime.js';
import { t } from '../../i18n/index.js';

const props = defineProps({
  timeline: { type: Array, default: () => [] },
  currentStatus: { type: String, required: true },
});

const reachedAt = computed(() => {
  const map = {};
  for (const event of props.timeline) map[event.status] = event.at;
  return map;
});

const cancelled = computed(() => props.currentStatus === 'CANCELLED');
const currentIndex = computed(() => ORDER_FLOW.indexOf(props.currentStatus));
</script>

<template>
  <ol class="space-y-3" :aria-label="t('Order progress')">
    <li v-if="cancelled" class="flex items-start gap-3">
      <span class="mt-1 h-3 w-3 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
      <div>
        <p class="text-sm font-medium text-slate-900">{{ t('Cancelled') }}</p>
        <p class="text-xs text-slate-500">{{ formatTime(reachedAt.CANCELLED) }}</p>
      </div>
    </li>

    <li v-for="(status, index) in ORDER_FLOW" v-else :key="status" class="flex items-start gap-3">
      <span class="mt-1 h-3 w-3 shrink-0 rounded-full"
            :class="index <= currentIndex ? 'bg-primary' : 'bg-slate-300'" aria-hidden="true" />
      <div>
        <p class="text-sm" :class="index <= currentIndex ? 'font-medium text-slate-900' : 'text-slate-500'">
          {{ t(STATUS_LABEL[status]) }}
          <span v-if="index === currentIndex" class="sr-only">{{ t('(current step)') }}</span>
        </p>
        <p v-if="reachedAt[status]" class="text-xs text-slate-500">{{ formatTime(reachedAt[status]) }}</p>
      </div>
    </li>
  </ol>
</template>
