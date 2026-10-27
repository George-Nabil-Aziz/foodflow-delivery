<script setup>
/**
 * One-click discount codes: the ones `npm run seed` creates, so a code can be
 * tried without opening the admin's list.
 *
 * Rendered only under `import.meta.env.DEV`, and loaded through a dynamic
 * import in the dead branch, like DevAccounts, so it never ships in a
 * production build. The server still decides whether a code applies: the
 * notes only say what to expect.
 */
import { t } from '../../i18n/index.js';

const emit = defineEmits(['pick']);

const CODES = [
  { code: 'WELCOME10', note: '10% off, up to 100.00, on 100.00 or more; once per customer' },
  { code: 'SAVE50', note: '50.00 off on 300.00 or more' },
  { code: 'GRILL15', note: '15% off at Olive Grill only' },
  { code: 'OLDDEAL', note: 'Expired: shows the error' },
];
</script>

<template>
  <section class="mt-3 rounded-lg border border-dashed border-slate-300 p-3" aria-labelledby="dev-codes-title">
    <h3 id="dev-codes-title" class="text-xs font-semibold text-slate-900">
      {{ t('Development discount codes') }}
    </h3>
    <p class="mt-0.5 text-xs text-slate-600">
      {{ t('Click one to apply it. Shown in development only.') }}
    </p>

    <ul class="mt-2 space-y-1">
      <li v-for="item in CODES" :key="item.code">
        <button type="button"
                class="flex w-full flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-slate-200 px-3 py-2 text-start text-sm hover:border-brand-500 hover:bg-brand-50"
                @click="emit('pick', item.code)">
          <span class="font-mono font-medium text-slate-900">{{ item.code }}</span>
          <span class="text-xs text-slate-600">{{ t(item.note) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>
