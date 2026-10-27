/**
 * Money arithmetic on integer minor units (ADR-009, BR-F3).
 *
 * Amounts cross this boundary as 2-decimal strings; `pg` is configured to
 * return NUMERIC as a string, so a float never enters a calculation.
 * `0.1 + 0.2 !== 0.3` is precisely the bug this module exists to prevent.
 */
const toMinor = (value) => {
  if (value === null || value === undefined) throw new TypeError('money: value required');
  const s = typeof value === 'number' ? value.toFixed(2) : String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new TypeError(`money: invalid amount "${s}"`);
  const negative = s.startsWith('-');
  const [whole, frac = ''] = (negative ? s.slice(1) : s).split('.');
  const minor = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  return negative ? -minor : minor;
};

const toStr = (minor) => {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

export const money = {
  add: (a, b) => toStr(toMinor(a) + toMinor(b)),
  subtract: (a, b) => toStr(toMinor(a) - toMinor(b)),
  multiply: (a, qty) => {
    if (!Number.isInteger(qty)) throw new TypeError('money.multiply: quantity must be an integer');
    return toStr(toMinor(a) * BigInt(qty));
  },
  sum: (list) => toStr(list.reduce((acc, v) => acc + toMinor(v), 0n)),

  /** Half-up rounding at two decimals, applied once to the tax (BR-O3). */
  roundTax: (subtotal, rate) => {
    const scaled = toMinor(subtotal) * BigInt(Math.round(rate * 10000));
    const negative = scaled < 0n;
    const abs = negative ? -scaled : scaled;
    const rounded = (abs + 5000n) / 10000n;
    return toStr(negative ? -rounded : rounded);
  },

  /** `percent` of an amount, half-up at two decimals (BR-DC4). `percent` is a 2-decimal string. */
  percentOf: (amount, percent) => {
    const scaled = toMinor(amount) * toMinor(percent);
    const negative = scaled < 0n;
    const abs = negative ? -scaled : scaled;
    const rounded = (abs + 5000n) / 10000n;
    return toStr(negative ? -rounded : rounded);
  },
  /** The smaller of two amounts. */
  min: (a, b) => toStr(toMinor(a) <= toMinor(b) ? toMinor(a) : toMinor(b)),

  compare: (a, b) => {
    const x = toMinor(a);
    const y = toMinor(b);
    return x === y ? 0 : x < y ? -1 : 1;
  },
  isZero: (a) => toMinor(a) === 0n,
  /** Normalizes any accepted representation to a 2-decimal string. */
  format: (a) => toStr(toMinor(a)),
  ZERO: '0.00',
};
