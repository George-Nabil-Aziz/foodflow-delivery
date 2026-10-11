<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useFocusTrap } from '../../composables/useFocusTrap.js';
import { t } from '../../i18n/index.js';

/**
 * The navigation drawer for small screens.
 *
 * It opens from the start edge (the left in English, the right in Arabic),
 * behaves as a modal - focus moves in, Tab stays inside, Escape and the scrim
 * close it, focus returns to the menu button - and closes itself once a link
 * inside it has navigated. While it is open the page behind does not scroll.
 *
 * The panel is rendered only while open, so its links never duplicate the
 * page's own in the accessibility tree.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  label: { type: String, required: true },
});
const emit = defineEmits(['close']);

const panelRef = ref(null);
const route = useRoute();
const close = () => emit('close');

useFocusTrap(panelRef, () => props.open, close);

// A link inside the drawer has done its job once the route changes.
watch(() => route.fullPath, () => { if (props.open) close(); });

watch(() => props.open, (open) => {
  document.documentElement.style.overflow = open ? 'hidden' : '';
});
onBeforeUnmount(() => { document.documentElement.style.overflow = ''; });
</script>

<template>
  <Transition enter-active-class="transition-opacity duration-200" leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0" leave-to-class="opacity-0">
    <div v-if="open" class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" aria-hidden="true" @click="close" />
  </Transition>

  <Transition enter-active-class="transition-transform duration-200 ease-out"
              leave-active-class="transition-transform duration-150 ease-in"
              enter-from-class="-translate-x-full rtl:translate-x-full"
              leave-to-class="-translate-x-full rtl:translate-x-full">
    <div v-if="open" ref="panelRef" role="dialog" aria-modal="true" :aria-label="t(label)" tabindex="-1"
         class="fixed inset-y-0 start-0 z-50 flex w-[min(20rem,85vw)] flex-col overflow-y-auto
                border-e border-slate-200 bg-surface shadow-2xl focus:outline-none">
      <div class="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <slot name="header" />
        <button type="button"
                class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600
                       transition-colors hover:bg-slate-100 hover:text-slate-900"
                :aria-label="t('Close menu')" @click="close">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div class="flex-1 px-3 py-4">
        <slot />
      </div>
      <div v-if="$slots.footer" class="border-t border-slate-200 px-4 py-4">
        <slot name="footer" />
      </div>
    </div>
  </Transition>
</template>
