import { ref, onBeforeUnmount } from 'vue';

/**
 * A reactive CSS media query.
 *
 * Read synchronously on creation, so the first render already matches the
 * screen and a phone never flashes the desktop layout.
 *
 * Layouts use it rather than `hidden md:flex` when the mobile and desktop
 * variants hold the same controls: CSS-hidden duplicates would leave two
 * "Sign out" buttons in the accessibility tree, and only one of them usable.
 */
export function useMediaQuery(query) {
  const list = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null;
  const matches = ref(list?.matches ?? true);
  const update = (event) => { matches.value = event.matches; };

  list?.addEventListener?.('change', update);
  onBeforeUnmount(() => list?.removeEventListener?.('change', update));

  return matches;
}

/** Tailwind's `md` breakpoint: tablets and up get the full navigation. */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
