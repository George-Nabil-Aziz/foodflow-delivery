import { onUnmounted, ref } from 'vue';

/**
 * Interval polling that behaves itself.
 *
 * Pauses while the tab is hidden and fetches immediately on return, stops for
 * good once `shouldStop` says so, backs off after repeated failures so a
 * backend blip does not become a request storm, and always clears its timer on
 * unmount - including on the error path.
 *
 * This composable is the seam where WebSockets replace polling later: only this
 * file changes.
 */
export function usePolling(fetcher, options = {}) {
  const {
    intervalMs = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 10000),
    backoffMs = 30000,
    failureThreshold = 3,
    shouldStop = () => false,
    immediate = true,
  } = options;

  const data = ref(null);
  const error = ref(null);
  const loading = ref(false);
  const stopped = ref(false);

  let timer = null;
  let failures = 0;
  let disposed = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  function schedule() {
    clear();
    if (disposed || stopped.value) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const delay = failures >= failureThreshold ? backoffMs : intervalMs;
    timer = setTimeout(tick, delay);
  }

  async function tick() {
    if (disposed || stopped.value) return;
    loading.value = true;
    try {
      const result = await fetcher();
      data.value = result;
      error.value = null;
      failures = 0;
      if (shouldStop(result)) {
        stopped.value = true;
        clear();
        return;
      }
    } catch (err) {
      error.value = err;
      failures += 1;
    } finally {
      loading.value = false;
      schedule();
    }
  }

  function onVisibilityChange() {
    if (disposed || stopped.value) return;
    if (document.visibilityState === 'visible') tick();
    else clear();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  const start = () => {
    stopped.value = false;
    disposed = false;
    if (immediate) tick();
    else schedule();
  };

  const stop = () => {
    stopped.value = true;
    clear();
  };

  const dispose = () => {
    disposed = true;
    clear();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };

  onUnmounted(dispose);

  return { data, error, loading, stopped, start, stop, refresh: tick, dispose };
}
