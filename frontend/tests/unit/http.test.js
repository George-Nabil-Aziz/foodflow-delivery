import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, NetworkError, configureHttp, http } from '@/services/http.js';

// Stub the transport: these tests exercise the interceptors, not the network.
http.defaults.adapter = async (config) => ({
  data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config,
});

describe('ApiError', () => {
  it('carries the stable error code, details and status', () => {
    const err = new ApiError(
      { code: 'CART_RESTAURANT_MISMATCH', message: 'Conflict', details: [{ field: 'foodItemId' }] },
      409,
    );
    expect(err.code).toBe('CART_RESTAURANT_MISMATCH');
    expect(err.status).toBe(409);
    expect(err.details).toHaveLength(1);
  });

  it('falls back to INTERNAL_ERROR when the body has no code', () => {
    expect(new ApiError(undefined, 500).code).toBe('INTERNAL_ERROR');
  });

  it('NetworkError is distinct from an API error', () => {
    const err = new NetworkError();
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

/**
 * TC-369: the single-flight refresh.
 *
 * Refresh tokens are single-use with reuse detection, so N parallel 401s must
 * produce exactly ONE refresh call. Without this, a dashboard firing six
 * requests would replay a rotated token and log the user out.
 */
describe('TC-369: single-flight refresh', () => {
  let refreshCalls;
  let resolveRefresh;

  beforeEach(() => {
    refreshCalls = 0;
    configureHttp({
      getAccessToken: () => 'stale-token',
      refresh: () => {
        refreshCalls += 1;
        return new Promise((resolve) => {
          resolveRefresh = () => resolve('fresh-token');
        });
      },
      onUnauthenticated: () => {},
    });
  });

  it('issues exactly one refresh for many concurrent expiries', async () => {
    const expired = {
      response: { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } } },
      config: { url: '/me', method: 'get' },
    };

    // Grab the rejection interceptor the module registered.
    const handler = http.interceptors.response.handlers.at(-1).rejected;
    const retried = [];
    const originalRequest = http.request;
    http.request = vi.fn((config) => {
      retried.push(config.url);
      return Promise.resolve({ success: true, data: {} });
    });

    const attempts = [1, 2, 3, 4, 5].map(() =>
      handler({ ...expired, config: { ...expired.config, url: '/me' } }).catch(() => null));

    await Promise.resolve();
    resolveRefresh();
    await Promise.all(attempts);

    expect(refreshCalls).toBe(1);
    http.request = originalRequest;
  });
});

describe('TC-371: expired versus invalid tokens', () => {
  it('does not attempt a refresh for TOKEN_INVALID', async () => {
    let refreshCalls = 0;
    let loggedOut = false;
    configureHttp({
      getAccessToken: () => 'token',
      refresh: () => { refreshCalls += 1; return Promise.resolve('x'); },
      onUnauthenticated: () => { loggedOut = true; },
    });

    const handler = http.interceptors.response.handlers.at(-1).rejected;
    await handler({
      response: { status: 401, data: { error: { code: 'TOKEN_INVALID' } } },
      config: { url: '/me' },
    }).catch(() => null);

    expect(refreshCalls).toBe(0);
    expect(loggedOut).toBe(true);
  });

  it('does not log out on bad credentials at the login form', async () => {
    let loggedOut = false;
    configureHttp({
      getAccessToken: () => null,
      refresh: () => Promise.resolve('x'),
      onUnauthenticated: () => { loggedOut = true; },
    });

    const handler = http.interceptors.response.handlers.at(-1).rejected;
    const err = await handler({
      response: { status: 401, data: { error: { code: 'INVALID_CREDENTIALS' } } },
      config: { url: '/auth/login' },
    }).catch((e) => e);

    expect(loggedOut).toBe(false);
    expect(err.code).toBe('INVALID_CREDENTIALS');
  });

  it('TC-372: a transport failure becomes a NetworkError', async () => {
    const handler = http.interceptors.response.handlers.at(-1).rejected;
    const err = await handler({ config: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
  });
});
