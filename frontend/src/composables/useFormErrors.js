import { ref } from 'vue';

/**
 * Maps a 422 response's details[] back onto the offending form fields, so a
 * rule the client does not know about still lands on the right input rather
 * than in an anonymous banner.
 */
export function useFormErrors() {
  const fieldErrors = ref({});
  const formError = ref(null);

  function clear() {
    fieldErrors.value = {};
    formError.value = null;
  }

  function capture(err) {
    clear();
    if (!err) return;

    const details = err.details ?? [];
    if (details.length) {
      const mapped = {};
      for (const detail of details) {
        if (detail.field) mapped[detail.field] = detail.issue ?? 'Invalid value';
      }
      fieldErrors.value = mapped;
    }

    // Anything without a field mapping still needs to be visible.
    if (!details.some((d) => d.field)) formError.value = err.message;
    else if (err.code !== 'VALIDATION_ERROR') formError.value = err.message;
  }

  const fieldError = (name) => fieldErrors.value[name] ?? null;

  return { fieldErrors, formError, capture, clear, fieldError };
}
