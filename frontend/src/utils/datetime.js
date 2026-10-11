import { intlLocale, locale } from '../i18n/index.js';

// English keeps the browser's own conventions, as before; Arabic is explicit.
const dateLocale = () => (locale.value === 'ar' ? intlLocale.value : undefined);

export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(dateLocale(), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
}

export function relativeMinutes(value) {
  if (!value) return null;
  return Math.round((Date.now() - new Date(value).getTime()) / 60000);
}
