import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '../services/api.js';
import { configureHttp } from '../services/http.js';
import { locale, setLocale } from '../i18n/index.js';

const STORAGE_KEY = 'foodflow.session';

/**
 * Session state. Tokens live in localStorage - an accepted trade documented as
 * risk R-08, mitigated by short access tokens and revocable, rotating refresh
 * tokens.
 *
 * The store exposes `role` but deliberately offers no `can()` helper: hiding a
 * control the user cannot use is a courtesy, and the server is the control.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const restaurant = ref(null);
  const driverProfile = ref(null);
  const accessToken = ref(null);
  const refreshToken = ref(null);

  const isAuthenticated = computed(() => Boolean(accessToken.value && user.value));
  const role = computed(() => user.value?.role ?? null);

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user: user.value,
          restaurant: restaurant.value,
          driverProfile: driverProfile.value,
          accessToken: accessToken.value,
          refreshToken: refreshToken.value,
        }),
      );
    } catch {
      // A private window with storage disabled must not break the app.
    }
  }

  /**
   * Once signed in, a language the user saved wins over this browser's. One
   * never chosen (null) is filled in from the language they are browsing in,
   * so signing in never switches the screen back to English.
   */
  function syncLanguage(u) {
    if (u?.preferredLanguage) setLocale(u.preferredLanguage);
    else if (u) saveLanguage(locale.value);
  }

  function setSession(payload) {
    user.value = payload.user ?? user.value;
    restaurant.value = payload.restaurant ?? restaurant.value ?? null;
    driverProfile.value = payload.driverProfile ?? driverProfile.value ?? null;
    if (payload.accessToken) accessToken.value = payload.accessToken;
    if (payload.refreshToken) refreshToken.value = payload.refreshToken;
    persist();
    if (payload.user) syncLanguage(payload.user);
  }

  function clear() {
    user.value = null;
    restaurant.value = null;
    driverProfile.value = null;
    accessToken.value = null;
    refreshToken.value = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignored
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        user.value = saved.user ?? null;
        if (user.value?.preferredLanguage) setLocale(user.value.preferredLanguage);
        restaurant.value = saved.restaurant ?? null;
        driverProfile.value = saved.driverProfile ?? null;
        accessToken.value = saved.accessToken ?? null;
        refreshToken.value = saved.refreshToken ?? null;
      }
    } catch {
      clear();
    }
    wireHttp();
  }

  /** Performs the refresh the HTTP layer calls, single-flighted there. */
  async function performRefresh() {
    if (!refreshToken.value) throw new Error('no refresh token');
    const { data } = await authApi.refresh(refreshToken.value);
    accessToken.value = data.accessToken;
    refreshToken.value = data.refreshToken;
    persist();
    return data.accessToken;
  }

  /**
   * The server no longer accepts this session (expired, revoked, suspended):
   * forget it and go to sign-in, coming back here afterwards. The router is
   * imported lazily because it imports this store for its guards.
   */
  async function sessionLost() {
    clear();
    const { router } = await import('../router/index.js');
    const current = router.currentRoute.value;
    // Already on sign-in (a failed login lands here too): stay and show the form's error.
    if (current.name === 'login') return;
    router.replace({ name: 'login', query: { redirect: current.fullPath } });
  }

  function wireHttp() {
    configureHttp({
      getAccessToken: () => accessToken.value,
      refresh: performRefresh,
      onUnauthenticated: sessionLost,
    });
  }

  async function login(credentials) {
    const { data } = await authApi.login(credentials);
    setSession(data);
    return data;
  }

  async function register(payload) {
    const { data } = await authApi.register({ ...payload, preferredLanguage: locale.value });
    setSession(data);
    return data;
  }

  /**
   * Saves the language the user just switched to. Fire-and-forget: the switch
   * is already applied and must not wait on, or fail with, the network.
   */
  function saveLanguage(lang) {
    if (!isAuthenticated.value) return;
    user.value = { ...user.value, preferredLanguage: lang };
    persist();
    authApi.updateMe({ preferredLanguage: lang }).catch(() => {});
  }

  async function logout() {
    try {
      if (refreshToken.value) await authApi.logout(refreshToken.value);
    } catch {
      // Logging out locally must succeed even if the call fails.
    }
    clear();
  }

  async function loadMe() {
    const { data } = await authApi.me();
    setSession(data);
    return data;
  }

  wireHttp();

  return {
    user, restaurant, driverProfile, accessToken, refreshToken,
    isAuthenticated, role,
    restore, setSession, clear, login, register, saveLanguage, logout, loadMe, performRefresh,
  };
});
