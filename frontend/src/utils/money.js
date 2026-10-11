import { locale } from '../i18n/index.js';

/**
 * Display-only formatting. The client never computes a monetary value: every
 * total comes from the server, because duplicating the arithmetic guarantees
 * the two eventually disagree - about money.
 */
const CURRENCY = 'EGP';
const CURRENCY_AR = 'ج.م';

export function formatMoney(amount) {
  const value = Number(amount ?? 0).toFixed(2);
  // Arabic puts the symbol after the figure; the digits stay Latin.
  return locale.value === 'ar' ? `${value} ${CURRENCY_AR}` : `${CURRENCY} ${value}`;
}

export function formatMoneyShort(amount) {
  if (amount === null || amount === undefined) return '0.00';
  return Number(amount).toFixed(2);
}
