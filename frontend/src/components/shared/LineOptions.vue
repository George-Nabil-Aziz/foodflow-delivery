<script setup>
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';

/**
 * The chosen options and the note of an order or cart line. Used by the cart,
 * checkout summary and the customer, restaurant and admin order views, so a
 * line reads the same everywhere. Renders nothing for a plain line.
 */
defineProps({
  options: { type: Array, default: () => [] },
  notes: { type: String, default: null },
});
</script>

<template>
  <div v-if="options.length || notes" class="mt-0.5 text-xs text-slate-600">
    <ul v-if="options.length">
      <li v-for="(o, i) in options" :key="o.optionId ?? i"
          :class="o.isRemoved ? 'line-through' : ''">
        {{ o.groupName ? `${o.groupName}: ` : '' }}{{ o.name }}
        <template v-if="Number(o.priceDelta) > 0"> (+{{ formatMoney(o.priceDelta) }})</template>
      </li>
    </ul>
    <p v-if="notes">{{ t('Note: {note}', { note: notes }) }}</p>
  </div>
</template>
