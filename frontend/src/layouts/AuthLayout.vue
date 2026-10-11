<script setup>
import { RouterView } from 'vue-router';
import BrandLogo from '../components/shared/BrandLogo.vue';
import ThemeToggle from '../components/shared/ThemeToggle.vue';
import LanguageToggle from '../components/shared/LanguageToggle.vue';
</script>

<template>
  <div class="app-shell relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
    <div class="absolute end-4 top-4 flex items-center gap-1"><LanguageToggle /><ThemeToggle /></div>
    <div class="mb-6"><BrandLogo size="lg" /></div>
    <main id="main" class="w-full max-w-md"><RouterView /></main>
  </div>
</template>
