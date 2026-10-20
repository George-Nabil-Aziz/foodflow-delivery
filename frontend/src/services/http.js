import axios from 'axios';

/** A typed client error carrying the server's stable error code. Views branch
 *  on `code`, never on message text. */
export class ApiError extends Error {
  constructor(error, status) {
    super(error?.message ?? 'Request failed');
    this.name = 'ApiError';
    this.code = error?.code ?? 'INTERNAL_ERROR';
    this.details = error?.details ?? [];
    this.status = status;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('We could not reach FoodFlow. Check your connection and try again.');
    this.name = 'NetworkError';
    this.code = 'NETWORK_ERROR';
    this.details = [];
  }
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 15000,
});

/*
 * Token access is injected by the auth store rather than imported, which keeps
 * this module free of a circular dependency on the store (which itself uses
 * `http` to log in).
 */
let tokenProvider = () => null;
let onRefresh = null;
let onAuthFailure = null;

export function configureHttp({ getAccessToken, refresh, onUnauthenticated }) {
  tokenProvider = getAccessToken;
  onRefresh = refresh;
  onAuthFailure = onUnauthenticated;
}

http.interceptors.request.use((config) => {
  const token = tokenProvider();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Single-flight refresh.
 *
 * Refresh tokens are single-use with reuse detection, so five parallel 401s
 * must produce ONE refresh call - otherwise the extra calls replay a rotated
 * token, trip REFRESH_TOKEN_REUSED, and log the user out mid-session. This is
 * the one piece of client plumbing that has to be right.
 */
let refreshPromise = null;

function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = Promise.resolve()
      .then(() => onRefresh?.())
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/*
 * The interceptor returns the whole envelope ({ success, data, meta }) rather
 * than just `data`, so paginated callers can read `meta.pagination` without a
 * second code path. Services destructure what they need.
 */
http.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const { response, config } = error;
    if (!response) throw new NetworkError();

    const body = response.data ?? {};
    const code = body?.error?.code;

    // TOKEN_EXPIRED means refresh and retry. TOKEN_INVALID means the session is
    // gone - retrying would only burn another token.
    if (response.status === 401 && code === 'TOKEN_EXPIRED' && !config._retried && onRefresh) {
      config._retried = true;
      try {
        await refreshOnce();
        return await http(config);
      } catch {
        onAuthFailure?.();
        throw new ApiError(body.error, response.status);
      }
    }

    // Any other 401, or an account suspended mid-session, ends the session.
    if ((response.status === 401 && code !== 'INVALID_CREDENTIALS') || code === 'ACCOUNT_SUSPENDED') {
      onAuthFailure?.();
    }

    throw new ApiError(body.error, response.status);
  },
);

/** Convenience for the common case where only the payload matters. */
export const unwrap = (envelope) => envelope?.data;
