<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { discoveryApi } from '../../services/api.js';
import { cuisineStyle } from '../../utils/cuisine.js';
import { formatMoney } from '../../utils/money.js';
import { t } from '../../i18n/index.js';

/**
 * The hero search box, with live suggestions.
 *
 * Typing a character or more asks the server for up to five restaurants
 * and three dishes, and lists them under the box. It is an ARIA combobox: the
 * arrow keys move through the suggestions, Enter opens the highlighted one,
 * Escape closes the list, and a screen reader announces the active option.
 * Enter with nothing highlighted runs the full search, as before.
 */
const props = defineProps({
  id: { type: String, required: true },
  /** Visual size of the field and button; the landing hero uses a larger one. */
  rounded: { type: String, default: 'rounded-lg' },
});

const router = useRouter();
const query = ref('');
const restaurants = ref([]);
const dishes = ref([]);
const open = ref(false);
const loading = ref(false);
const active = ref(-1);
const root = ref(null);

const MIN_CHARS = 1;
const listId = `${props.id}-suggestions`;

/** One flat list, so the arrow keys cross the two groups seamlessly. */
const options = computed(() => [
  ...restaurants.value.map((r) => ({ kind: 'restaurant', key: `r-${r.id}`, value: r })),
  ...dishes.value.map((d) => ({ kind: 'dish', key: `d-${d.id}`, value: d })),
]);
const optionId = (index) => `${props.id}-option-${index}`;
const hasResults = computed(() => options.value.length > 0);

let timer = null;
let stamp = 0;

watch(query, (value) => {
  clearTimeout(timer);
  active.value = -1;
  const term = value.trim();
  if (term.length < MIN_CHARS) {
    restaurants.value = [];
    dishes.value = [];
    open.value = false;
    return;
  }
  // A short pause before asking, so typing "shawarma" is one request, not eight.
  timer = setTimeout(() => fetchSuggestions(term), 250);
});

async function fetchSuggestions(term) {
  const mine = (stamp += 1);
  loading.value = true;
  open.value = true;
  try {
    const res = await discoveryApi.search({ q: term, limit: 5 });
    // A slower, older request must not overwrite a newer one's results.
    if (mine !== stamp) return;
    restaurants.value = res.data.restaurants.slice(0, 5);
    dishes.value = res.data.foodItems.slice(0, 3);
  } catch {
    if (mine !== stamp) return;
    restaurants.value = [];
    dishes.value = [];
  } finally {
    if (mine === stamp) loading.value = false;
  }
}

function close() {
  open.value = false;
  active.value = -1;
}

function choose(option) {
  close();
  const restaurantId = option.kind === 'restaurant' ? option.value.id : option.value.restaurant.id;
  router.push({ name: 'restaurant-detail', params: { id: restaurantId } });
}

function searchAll() {
  close();
  const term = query.value.trim();
  router.push({ name: 'restaurants', query: term ? { q: term } : {} });
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    if (open.value) {
      event.preventDefault();
      close();
    }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!hasResults.value) return;
    event.preventDefault();
    open.value = true;
    // Wraps at both ends, like every native list.
    const count = options.value.length;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    active.value = active.value < 0 && step < 0 ? count - 1 : (active.value + step + count) % count;
    return;
  }
  if (event.key === 'Enter' && open.value && active.value >= 0) {
    event.preventDefault();
    choose(options.value[active.value]);
  }
}

// Clicking anywhere outside the box dismisses the list.
function onDocumentPointer(event) {
  if (open.value && root.value && !root.value.contains(event.target)) close();
}
document.addEventListener('pointerdown', onDocumentPointer);
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.removeEventListener('pointerdown', onDocumentPointer);
});
</script>

<template>
  <form ref="root" class="relative flex flex-col gap-2 text-start min-[400px]:flex-row" role="search"
        @submit.prevent="searchAll">
    <div class="relative min-w-0 flex-1">
      <label :for="id" class="sr-only">{{ t('Search restaurants and dishes') }}</label>
      <input :id="id" v-model="query" type="search" autocomplete="off"
             role="combobox" aria-autocomplete="list" :aria-expanded="open && query.trim().length >= MIN_CHARS"
             :aria-controls="listId" :aria-activedescendant="active >= 0 ? optionId(active) : undefined"
             :placeholder="t('Search restaurants or dishes')"
             :class="`w-full ${rounded} bg-surface px-4 py-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/70`"
             @keydown="onKeydown" @focus="hasResults && (open = true)">

      <div v-if="open"
           class="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain
                  rounded-xl border border-slate-200 bg-surface py-2 text-slate-900 shadow-2xl">
        <p v-if="loading && !hasResults" class="px-4 py-3 text-sm text-slate-600">{{ t('Searching...') }}</p>
        <p v-else-if="!hasResults" class="px-4 py-3 text-sm text-slate-600">
          {{ t('No matches for "{q}"', { q: query.trim() }) }}
        </p>

        <!-- Options only inside the listbox, in two labelled groups. -->
        <div v-else :id="listId" role="listbox" :aria-label="t('Suggestions')">
          <div v-if="restaurants.length" role="group" :aria-labelledby="`${id}-group-r`">
          <p :id="`${id}-group-r`" class="px-4 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {{ t('Restaurants') }}
          </p>
          <div v-for="(r, i) in restaurants" :id="optionId(i)" :key="`r-${r.id}`" role="option"
               :aria-selected="active === i"
               class="flex cursor-pointer items-center gap-3 px-4 py-2.5"
               :class="active === i ? 'bg-brand-50' : 'hover:bg-slate-50'"
               @mousedown.prevent @click="choose({ kind: 'restaurant', value: r })" @mouseenter="active = i">
            <span :class="`cuisine-cover ${cuisineStyle(r.cuisineType).cover} flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl`"
                  aria-hidden="true">
              <span class="relative z-10">{{ cuisineStyle(r.cuisineType).icon }}</span>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ r.name }}</span>
              <span class="block truncate text-xs text-slate-600">
                {{ t(cuisineStyle(r.cuisineType).label) }}
                <template v-if="!r.isOrderable"> &middot; {{ t('Not accepting orders right now') }}</template>
              </span>
            </span>
          </div>
          </div>

          <div v-if="dishes.length" role="group" :aria-labelledby="`${id}-group-d`">
          <p :id="`${id}-group-d`" class="mt-1 border-t border-slate-200 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {{ t('Dishes') }}
          </p>
          <div v-for="(d, j) in dishes" :id="optionId(restaurants.length + j)" :key="`d-${d.id}`" role="option"
               :aria-selected="active === restaurants.length + j"
               class="flex cursor-pointer items-center gap-3 px-4 py-2.5"
               :class="active === restaurants.length + j ? 'bg-brand-50' : 'hover:bg-slate-50'"
               @mousedown.prevent @click="choose({ kind: 'dish', value: d })"
               @mouseenter="active = restaurants.length + j">
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ d.name }}</span>
              <span class="block truncate text-xs text-slate-600">{{ t('at {restaurant}', { restaurant: d.restaurant.name }) }}</span>
            </span>
            <span class="shrink-0 text-sm font-semibold text-brand-800">{{ formatMoney(d.price) }}</span>
          </div>
          </div>
        </div>

        <button type="submit"
                class="mt-1 block w-full border-t border-slate-200 px-4 pb-1 pt-3 text-start text-sm font-semibold text-brand-700 hover:underline">
          {{ t('See all results for "{q}"', { q: query.trim() }) }}
        </button>
      </div>
    </div>

    <button type="submit"
            :class="`${rounded} bg-slate-900 px-5 py-3 font-semibold text-slate-50 transition-colors hover:bg-slate-800`">
      {{ t('Search') }}
    </button>
  </form>
</template>
