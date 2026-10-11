import { ref } from 'vue';

/**
 * Light / dark theme.
 *
 * index.html applies the theme before the first paint, so a dark-mode user
 * never sees a white flash; this module reads what that script decided and
 * owns every change after it. State is module-level: every toggle on the page
 * shares one theme.
 *
 * An explicit choice is persisted and wins. Until the user makes one, the
 * system preference is followed, including when it changes mid-session.
 */
export const THEME_STORAGE_KEY = 'foodflow.theme';

const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

function storedChoice() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    // Storage can be blocked (private mode, site-data settings): fall back.
    return null;
  }
}

const initial = () => storedChoice() ?? (media?.matches ? 'dark' : 'light');

const theme = ref(typeof document !== 'undefined' ? initial() : 'light');

function apply(value) {
  const root = document.documentElement;
  root.classList.toggle('dark', value === 'dark');
  root.style.colorScheme = value;
}

media?.addEventListener?.('change', (event) => {
  if (storedChoice()) return;
  theme.value = event.matches ? 'dark' : 'light';
  apply(theme.value);
});

export function useTheme() {
  function setTheme(value) {
    theme.value = value;
    apply(value);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // Not persisted, but still applied for this page view.
    }
  }

  const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark');

  return { theme, setTheme, toggleTheme };
}
