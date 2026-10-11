import { ref, shallowRef } from 'vue';

/**
 * Request state for a view: loading, error, data.
 *
 * Returns fresh refs per caller, so two screens showing the same kind of data
 * never fight over one array. Server data lives here, in the view, rather than
 * in a global store.
 */
export function useApi(fetcher, { initial = null } = {}) {
  const data = shallowRef(initial);
  const error = ref(null);
  const loading = ref(false);
  const meta = ref({});

  async function run(...args) {
    loading.value = true;
    error.value = null;
    try {
      const envelope = await fetcher(...args);
      data.value = envelope?.data ?? envelope;
      meta.value = envelope?.meta ?? {};
      return data.value;
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return { data, error, loading, meta, run };
}
