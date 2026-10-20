<script setup>
import { useAuthStore } from '../stores/auth.store.js';
import DashboardLayout from './DashboardLayout.vue';
import PublicLayout from './PublicLayout.vue';

/**
 * The public pages (home, restaurants, a menu): a signed-in customer browses
 * them inside the same sidebar shell as the rest of their pages; a guest, or
 * any other role, sees the public header.
 */
const auth = useAuthStore();
</script>

<template>
  <DashboardLayout v-if="auth.isAuthenticated && auth.role === 'CUSTOMER'" />
  <PublicLayout v-else />
</template>
