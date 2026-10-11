<script setup>
import { t } from '../../i18n/index.js';

defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: null },
  type: { type: String, default: 'text' },
  error: { type: String, default: null },
  hint: { type: String, default: null },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: null },
  id: { type: String, required: true },
});
defineEmits(['update:modelValue', 'blur']);
</script>

<template>
  <div>
    <label v-if="label" :for="id" class="field-label">
      {{ t(label) }}<span v-if="required" class="text-red-600" aria-hidden="true"> *</span>
    </label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder ? t(placeholder) : null"
      :disabled="disabled"
      :required="required"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
      class="field-input"
      :class="error ? 'border-red-500' : ''"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur')"
    >
    <p v-if="hint && !error" :id="`${id}-hint`" class="mt-1 text-xs text-slate-500">{{ t(hint) }}</p>
    <p v-if="error" :id="`${id}-error`" class="field-error" role="alert">{{ t(error) }}</p>
  </div>
</template>
