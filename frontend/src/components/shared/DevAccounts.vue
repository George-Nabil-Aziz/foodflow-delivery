<script setup>
/**
 * One-click sign-in with one seeded development account per role.
 *
 * Rendered only under `import.meta.env.DEV`, and loaded through a dynamic
 * import in the dead branch, so neither this panel nor these placeholder
 * passwords ship in a production build. They are the values `npm run seed`
 * creates — not real credentials. Every other seeded account is listed on the
 * admin's Users screen.
 */
import { t } from '../../i18n/index.js';

const emit = defineEmits(['pick']);

const ACCOUNTS = [
  { role: 'Admin', email: 'sayed.hanafy@foodflow.com', password: 'Admin123!seed' },
  { role: 'Customer', email: 'sara.idris@gmail.com', password: 'Passw0rd!seed' },
  { role: 'Restaurant', email: 'olive.grill@foodflow.com', password: 'Passw0rd!seed' },
  { role: 'Driver', email: 'driver@foodflow.com', password: 'Passw0rd!seed' },
];

const pick = ({ email, password }) => emit('pick', { email, password });
</script>

<template>
  <section class="card mt-6 p-4" aria-labelledby="dev-accounts-title">
    <h2 id="dev-accounts-title" class="text-sm font-semibold text-slate-900">
      {{ t('Development accounts') }}
    </h2>
    <p class="mt-1 text-xs text-slate-600">
      {{ t('Click one to sign in. Shown in development only.') }}
    </p>

    <ul class="mt-3 space-y-1">
      <li v-for="account in ACCOUNTS" :key="account.email">
        <button type="button"
                class="flex w-full flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-slate-200 px-3 py-3 text-start text-sm hover:border-brand-500 md:py-2 hover:bg-brand-50"
                @click="pick(account)">
          <span class="font-medium text-slate-900">{{ t(account.role) }}</span>
          <span class="break-all text-xs text-slate-600">
            {{ account.email }}<template v-if="account.note"> · {{ account.note }}</template>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
