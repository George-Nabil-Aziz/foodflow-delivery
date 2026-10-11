import { ref } from 'vue';

/**
 * Confirmation dialog state. Destructive actions name their specific
 * consequence, because an operator acting on the wrong row is the realistic
 * failure mode - not an operator acting maliciously.
 */
export function useConfirm() {
  const open = ref(false);
  const config = ref({});
  let resolver = null;

  function confirm(options) {
    config.value = {
      title: 'Are you sure?',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      variant: 'danger',
      requireReason: false,
      ...options,
    };
    open.value = true;
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function accept(reason) {
    open.value = false;
    resolver?.({ confirmed: true, reason });
    resolver = null;
  }

  function cancel() {
    open.value = false;
    resolver?.({ confirmed: false });
    resolver = null;
  }

  return { open, config, confirm, accept, cancel };
}
