import crypto from 'node:crypto';

// Crockford-style alphabet: no I, L, O or U, so a number read aloud over the
// phone to support cannot be misheard.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Human-readable order number, FF-YYYYMMDD-XXXXXX (BR-O7).
 * Non-sequential by design, so daily order volume is not leaked to competitors.
 */
export function generateOrderNumber(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += ALPHABET[bytes[i] % ALPHABET.length];
  return `FF-${y}${m}${d}-${suffix}`;
}

export const ORDER_NUMBER_PATTERN = /^FF-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/;
