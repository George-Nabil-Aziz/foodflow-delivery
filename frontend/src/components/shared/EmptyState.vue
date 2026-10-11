<script setup>
import { t } from '../../i18n/index.js';

defineProps({
  title: { type: String, required: true },
  message: { type: String, default: null },
});
</script>

<template>
  <!-- An empty result is not an error: it says so, and offers a way forward. -->
  <div class="card empty-state border-dashed p-8 text-center">
    <h3 class="text-base font-semibold text-slate-800">{{ t(title) }}</h3>
    <p v-if="message" class="mt-1 text-sm text-slate-600">{{ t(message) }}</p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
