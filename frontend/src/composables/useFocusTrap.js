import { watch, nextTick, onBeforeUnmount } from 'vue';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const visible = (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;

/**
 * Makes a modal behave like one: focus moves in when it opens, Tab cycles
 * inside it, Escape dismisses it, and focus returns to whatever opened it.
 *
 * Without the trap, tabbing out of an open dialog lands on the page behind —
 * which a sighted mouse user never notices and a keyboard or screen-reader
 * user cannot recover from, because the page behind is visually obscured and
 * still fully interactive (NFR-14).
 *
 * @param {import('vue').Ref<HTMLElement|null>} containerRef the dialog element
 * @param {() => boolean} isOpen reactive open state
 * @param {() => void} onEscape what Escape should do
 */
export function useFocusTrap(containerRef, isOpen, onEscape) {
  let previouslyFocused = null;

  const focusable = () =>
    Array.from(containerRef.value?.querySelectorAll(FOCUSABLE) ?? []).filter(visible);

  function onKeydown(event) {
    if (!isOpen()) return;

    if (event.key === 'Escape') {
      event.stopPropagation();
      onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = focusable();
    if (items.length === 0) {
      // Nothing to move to, so keep focus on the dialog itself.
      event.preventDefault();
      containerRef.value?.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    // Wrap at both ends, and pull focus back in if it has already escaped.
    if (event.shiftKey && (active === first || !containerRef.value?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !containerRef.value?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  watch(isOpen, async (open) => {
    if (open) {
      previouslyFocused = document.activeElement;
      document.addEventListener('keydown', onKeydown, true);
      await nextTick();
      // The dialog itself first, so a screen reader announces its label
      // before reading the first control.
      containerRef.value?.focus();
    } else {
      document.removeEventListener('keydown', onKeydown, true);
      // Returning focus is what makes the dialog feel like a detour rather
      // than a dead end: the keyboard lands back on the control that opened it.
      previouslyFocused?.focus?.();
      previouslyFocused = null;
    }
  });

  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true));
}
