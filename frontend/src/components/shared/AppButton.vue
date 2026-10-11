<script setup>
import { computed } from 'vue';

const props = defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  /** Rendered as text next to the control, never conveyed by styling alone. */
  disabledReason: { type: String, default: null },
});

const variants = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-hover disabled:opacity-50',
  secondary: 'bg-surface text-slate-800 border border-slate-300 shadow-sm hover:bg-slate-50 '
    + 'hover:border-slate-400 disabled:text-slate-400 disabled:hover:bg-surface',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger-hover disabled:opacity-50',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400',
};
// Below md every size is at least 44px tall, so a thumb can hit it; the
// desktop sizes are unchanged.
const sizes = {
  sm: 'min-h-11 px-3 py-1.5 text-sm md:min-h-0',
  md: 'min-h-11 px-4 py-2 text-sm md:min-h-0',
  lg: 'min-h-12 px-5 py-2.5 text-base md:min-h-0',
};

const classes = computed(
  () => `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition
         duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 btn-${props.variant} ${variants[props.variant]} ${sizes[props.size]}`,
);
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-disabled="disabled || loading"
    :aria-describedby="disabledReason ? 'btn-reason' : undefined"
  >
    <span v-if="loading" class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
    <slot />
  </button>
</template>
