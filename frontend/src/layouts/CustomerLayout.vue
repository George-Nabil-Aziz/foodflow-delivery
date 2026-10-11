<script setup>
// Cart hydration lives in PublicLayout, next to the badge it feeds, so that a
// customer sees the same header on a public page as on a customer page.
import PublicLayout from './PublicLayout.vue';
</script>

<template>
  <PublicLayout />
</template>
