<script setup>
import { computed } from 'vue';
import { t } from '../../i18n/index.js';
import { useMediaQuery } from '../../composables/useMediaQuery.js';

const props = defineProps({
  pagination: { type: Object, default: () => ({ page: 1, totalPages: 1, total: 0 }) },
});
const emit = defineEmits(['change']);

// A phone shows the current page and the two ends; wider screens add one
// neighbour each side. Either way the row has a fixed maximum width.
const roomy = useMediaQuery('(min-width: 640px)');

/**
 * The page numbers to show, with null where a run of pages is skipped:
 * 9 pages, on page 5 -> [1, null, 4, 5, 6, null, 9].
 */
const pages = computed(() => {
  const { page, totalPages } = props.pagination;
  const siblings = roomy.value ? 1 : 0;
  const wanted = new Set([1, totalPages]);
  for (let p = page - siblings; p <= page + siblings; p += 1) {
    if (p >= 1 && p <= totalPages) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0) {
      const gap = p - sorted[i - 1];
      // A gap of exactly one page shows that page rather than an ellipsis
      // standing in for it.
      if (gap === 2) out.push(p - 1);
      else if (gap > 2) out.push(null);
    }
    out.push(p);
  });
  return out;
});

function go(page) {
  if (page < 1 || page > props.pagination.totalPages || page === props.pagination.page) return;
  emit('change', page);
  // A new page of results starts at the top, not where the old one ended.
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 44px tall on a phone for the thumb; 40px wide, and the arrows 36px, so the
// widest row (arrows, 1 … 5 … 9) still fits a 320px screen.
const cell = 'inline-flex h-11 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors md:h-10';
const arrow = 'min-w-9 px-0 sm:min-w-10 sm:gap-1 sm:px-3';
</script>

<template>
  <nav v-if="pagination.totalPages > 1" :aria-label="t('Pagination')"
       class="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
    <p class="text-sm text-slate-600">
      {{ t('Page {page} of {pages} · {total} results', { page: pagination.page, pages: pagination.totalPages, total: pagination.total }) }}
    </p>

    <ul class="flex items-center gap-0.5 sm:gap-1">
      <li>
        <button type="button" :class="`${cell} border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${arrow}`"
                :disabled="pagination.page <= 1" @click="go(pagination.page - 1)">
          <svg class="h-4 w-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span class="sr-only sm:not-sr-only">{{ t('Previous') }}</span>
        </button>
      </li>

      <li v-for="(p, i) in pages" :key="p ?? `gap-${i}`">
        <span v-if="p === null" :class="`${cell} text-slate-500`" aria-hidden="true">&hellip;</span>
        <button v-else type="button"
                :class="[cell, p === pagination.page
                  ? 'btn-primary bg-primary text-white shadow-sm'
                  : 'border border-slate-300 bg-surface text-slate-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800']"
                :aria-current="p === pagination.page ? 'page' : undefined"
                :aria-label="t('Page {n}', { n: p })"
                @click="go(p)">
          {{ p }}
        </button>
      </li>

      <li>
        <button type="button" :class="`${cell} border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${arrow}`"
                :disabled="pagination.page >= pagination.totalPages" @click="go(pagination.page + 1)">
          <span class="sr-only sm:not-sr-only">{{ t('Next') }}</span>
          <svg class="h-4 w-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </li>
    </ul>
  </nav>
</template>
