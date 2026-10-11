import { defineStore } from 'pinia';
import { ref } from 'vue';

let nextId = 0;

/** Cross-cutting UI state: toasts and a global busy flag. */
export const useUiStore = defineStore('ui', () => {
  const toasts = ref([]);
  const globalLoading = ref(false);

  function push(message, variant = 'info', timeout = 5000) {
    const id = (nextId += 1);
    toasts.value.push({ id, message, variant });
    if (timeout) setTimeout(() => dismiss(id), timeout);
    return id;
  }

  const dismiss = (id) => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  };

  return {
    toasts,
    globalLoading,
    dismiss,
    toast: (m) => push(m, 'info'),
    toastSuccess: (m) => push(m, 'success'),
    toastError: (m) => push(m, 'error', 8000),
  };
});
