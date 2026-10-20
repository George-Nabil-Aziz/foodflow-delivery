<script setup>
import { computed } from 'vue';
import { t } from '../../i18n/index.js';
import { useMediaQuery } from '../../composables/useMediaQuery.js';

const props = defineProps({
  pagination: { type: Object, default: () => ({ page: 1, totalPages: 1, total: 0 }) },
  // Rows per page. Passing a limit shows a selector that emits update:limit;
  // leaving it out keeps the caller's fixed page size and no selector.
  limit: { type: Number, default: null },
  pageSizes: { type: Array, default: () => [20, 40, 60, 80, 100] },
});
const emit = defineEmits(['change', 'update:limit']);

const sizeSelectId = `page-size-${Math.random().toString(36).slice(2, 8)}`;

// The selector stays while there is more than the smallest page's worth of
// rows, so a reader who picked 100 and now sees one page can go back.
const showSizes = computed(() => props.limit !== null && props.pagination.total > props.pageSizes[0]);
const visible = computed(() => props.pagination.totalPages > 1 || showSizes.value);

function setLimit(event) {
  const size = Number(event.target.value);
  if (size !== props.limit) emit('update:limit', size);
}

// Below xl (and beside the sidebar) the numbers show only the two ends and
// the current page; from xl they add one neighbour each side.
const wide = useMediaQuery('(min-width: 1280px)');

/**
 * The page numbers to show, with null where a run of pages is skipped:
 * 9 pages, on page 5 -> [1, null, 4, 5, 6, null, 9].
 */
const pages = computed(() => {
  const { page, totalPages } = props.pagination;
  const siblings = wide.value ? 1 : 0;
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

// 44px tall on a phone for the thumb. The arrows are icons until xl, where
// they gain their Previous / Next labels.
const cell = 'inline-flex h-11 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors md:h-10';
const arrow = 'xl:gap-1 xl:px-3';
</script>

<template>
  <!-- One row at every width: summary at the start, the pages in the centre,
       the page size at the end. Each part shortens as the room runs out. -->
  <nav v-if="visible" :aria-label="t('Pagination')"
       class="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
    <p class="whitespace-nowrap text-sm text-slate-600">
      <span class="xl:hidden">{{ t('{total} results', { total: pagination.total }) }}</span>
      <span class="hidden xl:inline">
        {{ t('Page {page} of {pages} · {total} results', { page: pagination.page, pages: pagination.totalPages, total: pagination.total }) }}
      </span>
    </p>

    <ul v-if="pagination.totalPages > 1" class="col-start-2 flex items-center gap-1">
      <li>
        <button type="button" :class="`${cell} border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${arrow}`"
                :disabled="pagination.page <= 1" @click="go(pagination.page - 1)">
          <svg class="h-4 w-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span class="sr-only xl:not-sr-only">{{ t('Previous') }}</span>
        </button>
      </li>

      <!-- A phone has room only for "5 / 9" between the arrows. -->
      <li class="sm:hidden">
        <span class="inline-flex h-11 items-center whitespace-nowrap px-2 text-sm font-medium text-slate-700">
          {{ pagination.page }} / {{ pagination.totalPages }}
        </span>
      </li>

      <li v-for="(p, i) in pages" :key="p ?? `gap-${i}`" class="hidden sm:block">
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
          <span class="sr-only xl:not-sr-only">{{ t('Next') }}</span>
          <svg class="h-4 w-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </li>
    </ul>

    <div v-if="showSizes" class="col-start-3 flex items-center justify-end gap-2 text-sm text-slate-600">
      <!-- Hidden below xl, the label is still read out with the select. -->
      <label :for="sizeSelectId" class="sr-only whitespace-nowrap xl:not-sr-only">{{ t('Rows per page') }}</label>
      <select :id="sizeSelectId" :value="limit"
              class="ui-control h-11 rounded-lg border border-slate-300 bg-surface px-2 text-sm text-slate-700 md:h-10"
              @change="setLimit">
        <option v-for="size in pageSizes" :key="size" :value="size">{{ size }}</option>
      </select>
    </div>
  </nav>
</template>
