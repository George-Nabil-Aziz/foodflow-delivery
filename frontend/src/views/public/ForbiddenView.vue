<script setup>
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';
import { homeFor } from '../../router/index.js';
import { t } from '../../i18n/index.js';
const auth = useAuthStore();
</script>

<template>
  <!--
    An explicit 403 rather than a silent redirect: naming the required role
    makes a dead link diagnosable by the person hitting it.
  -->
  <div class="card mx-auto max-w-lg p-10 text-center">
    <h1 class="text-2xl font-bold text-slate-900">{{ t('You do not have access to this page') }}</h1>
    <p class="mt-2 text-slate-600">
      {{ t('This area is for a different kind of account.') }}
      <template v-if="auth.isAuthenticated">
        {{ t('You are signed in as') }} <strong>{{ t(auth.role) }}</strong>.
      </template>
      <template v-else>{{ t('You are not signed in.') }}</template>
    </p>
    <RouterLink :to="auth.isAuthenticated ? homeFor(auth.role) : { name: 'login' }"
                class="inline-flex min-h-11 items-center justify-center md:min-h-0 mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
      {{ auth.isAuthenticated ? t('Go to my dashboard') : t('Sign in') }}
    </RouterLink>
  </div>
</template>
