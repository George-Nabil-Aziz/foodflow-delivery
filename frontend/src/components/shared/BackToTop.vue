<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { t } from '../../i18n/index.js';

// Shown once the reader is more than a screen down, where scrolling back by
// hand starts to be a chore.
const visible = ref(false);

function onScroll() {
  visible.value = window.scrollY > window.innerHeight;
}

function toTop() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  // Keyboard users land at the top of the content, not on a vanished button.
  const main = document.getElementById('main');
  if (main) {
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }
}

onMounted(() => {
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <Transition enter-from-class="opacity-0 translate-y-2" leave-to-class="opacity-0 translate-y-2"
              enter-active-class="transition duration-200" leave-active-class="transition duration-200">
    <button v-if="visible" type="button" :aria-label="t('Back to top')" :title="t('Back to top')"
            class="btn-primary fixed bottom-24 end-4 z-40 sm:bottom-20 sm:end-6 inline-flex h-11 w-11 items-center justify-center
                   rounded-full bg-primary text-white shadow-lg hover:bg-primary-hover"
            @click="toTop">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  </Transition>
</template>
