import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { http } from '@/services/http.js';
import {
  streamStatus, subscribeStream, resetStream, FAILURES_BEFORE_FALLBACK,
} from '@/services/liveStream.js';
import { useLiveUpdates } from '@/composables/useLiveUpdates.js';

/** A controllable stand-in for the browser's EventSource. */
class FakeEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.closed = false;
    this.listeners = {};
    FakeEventSource.instances.push(this);
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  close() { this.closed = true; }
  push(type, data = {}) { this.listeners[type]?.({ data: JSON.stringify({ type, ...data }) }); }
  fail() { this.onerror?.(); }
}
const latest = () => FakeEventSource.instances.at(-1);
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

let postSpy;
beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource;
  postSpy = vi.spyOn(http, 'post').mockImplementation(async () => ({ data: { ticket: `t-${Math.random()}` } }));
});
afterEach(() => {
  resetStream();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.EventSource;
});

describe('liveStream', () => {
  it('puts only the ticket in the URL, never the access token', async () => {
    subscribeStream(null, () => {});
    await flush();
    expect(postSpy).toHaveBeenCalledWith('/events/ticket');
    expect(latest().url).toMatch(/\/events\?ticket=t-/);
    expect(latest().url).not.toMatch(/token=|Bearer/i);
  });

  it('shares one connection between subscribers and closes after the last leaves', async () => {
    const off1 = subscribeStream(null, () => {});
    const off2 = subscribeStream(null, () => {});
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);
    off1();
    await vi.advanceTimersByTimeAsync(5000);
    expect(latest().closed).toBe(false);
    off2();
    await vi.advanceTimersByTimeAsync(5000);
    expect(latest().closed).toBe(true);
    expect(streamStatus.value).toBe('idle');
  });

  it('is open after the ready event and routes events by type', async () => {
    const seen = [];
    subscribeStream(['order.status'], (e) => seen.push(e.type));
    await flush();
    latest().push('ready');
    expect(streamStatus.value).toBe('open');
    latest().push('order.status', { orderId: 'o1' });
    latest().push('offer.created', { orderId: 'o1' });
    expect(seen).toEqual(['resync', 'order.status']);
  });

  it('reconnects with a fresh ticket after an error, backing off', async () => {
    subscribeStream(null, () => {});
    await flush();
    latest().push('ready');
    latest().fail();
    expect(streamStatus.value).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1500);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(postSpy).toHaveBeenCalledTimes(2);
  });

  it('reports failed after repeated failures but keeps retrying', async () => {
    subscribeStream(null, () => {});
    await flush();
    for (let i = 0; i < FAILURES_BEFORE_FALLBACK; i += 1) {
      latest().fail();
      await vi.advanceTimersByTimeAsync(40000);
    }
    expect(streamStatus.value).toBe('failed');
    expect(FakeEventSource.instances.length).toBeGreaterThan(FAILURES_BEFORE_FALLBACK);
  });

  it('gives up for good on an auth refusal', async () => {
    postSpy.mockRejectedValue(Object.assign(new Error('no'), { status: 403 }));
    subscribeStream(null, () => {});
    await flush();
    expect(streamStatus.value).toBe('failed');
    await vi.advanceTimersByTimeAsync(120000);
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('closes while the tab is hidden and reconnects when it is shown', async () => {
    subscribeStream(null, () => {});
    await flush();
    latest().push('ready');
    const first = latest();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(first.closed).toBe(true);
    expect(streamStatus.value).toBe('paused');

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});

describe('useLiveUpdates', () => {
  function setup(fetcher, options = {}) {
    let api;
    const wrapper = mount(defineComponent({
      setup() {
        api = useLiveUpdates(fetcher, { intervalMs: 10000, debounceMs: 50, immediate: true, ...options });
        return () => h('div');
      },
    }));
    return { api, wrapper };
  }

  it('polls until the stream is open, then stops polling and refetches on events', async () => {
    const fetcher = vi.fn().mockResolvedValue('x');
    const { api } = setup(fetcher, { events: ['order.status'] });
    api.start();
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1); // initial tick

    latest().push('ready');
    await vi.advanceTimersByTimeAsync(100);
    expect(fetcher).toHaveBeenCalledTimes(2); // resync on connect
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(2); // no polling while live

    latest().push('order.status', { orderId: 'o1' });
    latest().push('order.status', { orderId: 'o1' }); // burst coalesced
    await vi.advanceTimersByTimeAsync(100);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('ignores events its filter rejects', async () => {
    const fetcher = vi.fn().mockResolvedValue('x');
    const { api } = setup(fetcher, { events: ['order.status'], filter: (e) => e.orderId === 'mine' });
    api.start();
    await flush();
    latest().push('ready');
    await vi.advanceTimersByTimeAsync(100);
    const before = fetcher.mock.calls.length;
    latest().push('order.status', { orderId: 'someone-elses' });
    await vi.advanceTimersByTimeAsync(100);
    expect(fetcher).toHaveBeenCalledTimes(before);
  });

  it('falls back to polling when the stream drops', async () => {
    const fetcher = vi.fn().mockResolvedValue('x');
    const { api } = setup(fetcher);
    api.start();
    await flush();
    latest().push('ready');
    await vi.advanceTimersByTimeAsync(100);
    const before = fetcher.mock.calls.length;

    latest().fail();
    await flush();
    expect(fetcher.mock.calls.length).toBe(before + 1); // immediate catch-up
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(before + 2);
  });

  it('does not open a stream for a view that never starts, and leaves on unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue('x');
    const { api, wrapper } = setup(fetcher);
    await flush();
    expect(FakeEventSource.instances).toHaveLength(0);
    api.start();
    await flush();
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(latest().closed).toBe(true);
  });

  it('stops listening once shouldStop says the data is final', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 'DELIVERED' });
    const { api } = setup(fetcher, { shouldStop: (d) => d.status === 'DELIVERED' });
    api.start();
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.stopped.value).toBe(true);
    expect(latest().closed).toBe(true);
  });
});
