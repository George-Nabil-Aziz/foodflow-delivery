<script setup>
import { t } from '../../i18n/index.js';

defineProps({
  modelValue: { type: Number, default: null },
  label: { type: String, required: true },
  name: { type: String, required: true },
  readonly: { type: Boolean, default: false },
});
defineEmits(['update:modelValue']);
const values = [1, 2, 3, 4, 5];
</script>

<template>
  <!--
    A radio group, not a row of icons: keyboard-operable with arrow keys, and
    each option carries a text label, because stars alone fail NFR-14.
  -->
  <fieldset :disabled="readonly">
    <legend class="field-label">{{ t(label) }}</legend>
    <div class="flex gap-1" role="radiogroup" :aria-label="t(label)">
      <label v-for="value in values" :key="value"
             class="cursor-pointer rounded px-1 text-2xl leading-none focus-within:ring-2 focus-within:ring-brand-500"
             :class="modelValue >= value ? 'text-amber-500' : 'text-slate-300'">
        <input type="radio" :name="name" :value="value" :checked="modelValue === value"
               class="sr-only" @change="$emit('update:modelValue', value)">
        <span aria-hidden="true">&starf;</span>
        <span class="sr-only">{{ value === 1 ? t('{n} star', { n: value }) : t('{n} stars', { n: value }) }}</span>
      </label>
      <span v-if="modelValue" class="ms-2 self-center text-sm text-slate-600">
        {{ t('{n} of 5', { n: modelValue }) }}
      </span>
    </div>
  </fieldset>
</template>
