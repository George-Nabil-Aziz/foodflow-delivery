<script setup>
import { useAuthStore } from '../../stores/auth.store.js';
import LandingView from './LandingView.vue';
import DiscoverView from '../customer/DiscoverView.vue';

/**
 * "/" is the landing page for a visitor and the ordering home once signed in.
 * Both are public: browsing never required an account, only ordering does.
 */
const auth = useAuthStore();
</script>

<template>
  <DiscoverView v-if="auth.isAuthenticated" />
  <LandingView v-else />
</template>
