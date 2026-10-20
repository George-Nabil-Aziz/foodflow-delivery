<script setup>
import { RouterLink } from 'vue-router';

defineProps({
  size: { type: String, default: 'md' },
  // In a crowded bar the wordmark gives way on a very narrow phone, leaving
  // the mark; the name is still read out, and the menu drawer shows it in full.
  collapsible: { type: Boolean, default: false },
});
</script>

<template>
  <!-- The mark is decorative; the link's accessible name stays "FoodFlow". -->
  <RouterLink to="/"
              class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg font-bold tracking-tight text-slate-900 md:min-h-0"
              :class="size === 'lg' ? 'text-2xl' : 'text-lg'">
    <span class="inline-flex items-center justify-center rounded-lg bg-primary text-white shadow-sm"
          :class="size === 'lg' ? 'h-9 w-9' : 'h-7 w-7'" aria-hidden="true">
      <svg :class="size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 11h18a9 9 0 0 1-18 0Z" />
        <path d="M12 3v4M8 5v2M16 5v2" />
      </svg>
    </span>
    <span :class="{ 'max-[379px]:sr-only': collapsible }">Food<span class="text-brand-700">Flow</span></span>
  </RouterLink>
</template>
