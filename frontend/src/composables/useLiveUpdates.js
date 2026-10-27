import { computed, onUnmounted, watch } from 'vue';
import { usePolling } from './usePolling.js';
import { streamStatus, subscribeStream } from '../services/liveStream.js';

/**
 * Live data with polling as the safety net.
 *
 * Same contract as `usePolling` (data, error, loading, stopped, start, stop,
 * refresh, dispose) so a view switches by changing one call. While the shared
 * server-sent-events stream is open, polling is suspended and an incoming event
 * triggers a refetch through `fetcher` - the event says only that something
 * changed, so authorization and the response shape stay with the normal
 * endpoint. While the stream is connecting, failed or paused, polling runs
 * exactly as before; when the stream comes back, polling hands over again.
 *
 * Options beyond usePolling's:
 *   events     event names to react to (default: all)
 *   filter     (event) => boolean, to ignore events about something else
 *   debounceMs coalesces a burst of events into one refetch
 */
export function useLiveUpdates(fetcher, options = {}) {
  const { events = null, filter = null, debounceMs = 250, ...pollingOptions } = options;
  const polling = usePolling(fetcher, pollingOptions);

  const live = computed(() => streamStatus.value === 'open');

  let unsubscribe = null;
  let active = false;
  let timer = null;
  let inFlight = false;
  let again = false;

  async function refetch() {
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    try {
      await polling.refresh();
    } finally {
      inFlight = false;
      if (again) {
        again = false;
        refetch();
      }
    }
  }

  function onEvent(event) {
    if (!active || polling.stopped.value) return;
    if (event.type !== 'resync' && filter && !filter(event)) return;
    clearTimeout(timer);
    timer = setTimeout(refetch, debounceMs);
  }

  // Polling and the stream never both run: whichever is up owns freshness.
  watch(live, (isLive) => {
    if (!active) return;
    if (isLive) polling.suspend();
    else polling.resume();
  }, { flush: 'sync' });

  // A terminal result stops polling for good; stop listening too.
  watch(polling.stopped, (isStopped) => { if (isStopped) leave(); });

  function start() {
    active = true;
    // Re-sync the timer with the stream's state, which may have changed while stopped.
    if (live.value) polling.suspend();
    else polling.resume();
    polling.start();
    if (!unsubscribe) unsubscribe = subscribeStream(events, onEvent);
  }

  function leave() {
    active = false;
    clearTimeout(timer);
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  }

  function stop() {
    leave();
    polling.stop();
  }

  function dispose() {
    leave();
    polling.dispose();
  }

  onUnmounted(dispose);

  return { ...polling, start, stop, dispose, live };
}
