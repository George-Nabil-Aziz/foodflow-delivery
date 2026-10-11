import { ref, computed } from 'vue';

/**
 * English / Arabic.
 *
 * The English text is the key: `t('Sign in')` renders "Sign in" in English
 * and looks the phrase up in the Arabic catalogue otherwise. English needs no
 * catalogue, a missing translation falls back to readable English rather than
 * a key name, and the source stays greppable by what the user sees.
 *
 * Placeholders use braces: t('Page {page} of {total}', { page, total }).
 *
 * When one English word needs two Arabic translations, a context tells them
 * apart: t('Active', null, 'status') looks up 'status::Active' first.
 *
 * The catalogue is split by area (src/i18n/ar/*.js) and merged here. State is
 * module-level, so every component shares one locale and re-renders on change.
 */
const catalogues = import.meta.glob('./ar/*.js', { eager: true, import: 'default' });
const AR = Object.assign({}, ...Object.values(catalogues));

export const LOCALE_STORAGE_KEY = 'foodflow.locale';
export const LOCALES = ['en', 'ar'];

function storedLocale() {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export const locale = ref(typeof document !== 'undefined' ? storedLocale() ?? 'en' : 'en');
export const isRtl = computed(() => locale.value === 'ar');

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** Translates a UI string. Reading `locale` makes every caller reactive. */
export function t(text, params, context) {
  if (text == null) return '';
  const source = String(text);
  const translated = locale.value === 'ar'
    ? (context && AR[`${context}::${source}`]) ?? AR[source] ?? source
    : source;
  return interpolate(translated, params);
}

function apply(value) {
  const root = document.documentElement;
  root.lang = value;
  root.dir = value === 'ar' ? 'rtl' : 'ltr';
}

export function setLocale(value) {
  if (!LOCALES.includes(value)) return;
  locale.value = value;
  apply(value);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, value);
  } catch {
    // Not persisted, but still applied for this page view.
  }
}

/** The Intl locale for numbers and dates. Latin digits in both languages. */
export const intlLocale = computed(() => (locale.value === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'));

export function useI18n() {
  return { t, locale, isRtl, setLocale, intlLocale };
}
