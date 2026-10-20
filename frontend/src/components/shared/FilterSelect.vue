<script setup>
defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="min-w-0 shrink-0">
    <!-- Named for assistive tech; the selected option says what it filters. -->
    <label :for="id" class="sr-only">{{ label }}</label>
    <select :id="id" class="ui-control field-input w-auto max-w-[12rem] sm:max-w-none sm:min-w-40"
            :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <slot />
    </select>
  </div>
</template>
