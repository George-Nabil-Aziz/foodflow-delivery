/**
 * Client-side validation rules.
 *
 * These mirror the backend schemas to improve UX - they show an error on blur
 * instead of after a round trip. They are NOT a security control: every rule is
 * enforced again server-side, which is the source of truth.
 */
export const rules = {
  required: (label = 'This field') => (v) =>
    (v !== null && v !== undefined && String(v).trim() !== '') ? null : `${label} is required`,

  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim())
    ? null : 'Enter a valid email address'),

  password: (v) => {
    const s = String(v ?? '');
    if (s.length < 8) return 'Must be at least 8 characters';
    if (s.length > 72) return 'Must be at most 72 characters';
    if (!/[A-Za-z]/.test(s)) return 'Must contain at least one letter';
    if (!/\d/.test(s)) return 'Must contain at least one digit';
    return null;
  },

  // Egyptian mobiles only, local or international; mirrors the server's rule.
  phone: (v) => (/^(\+20|0)1[0125]\d{8}$/.test(String(v ?? '').trim())
    ? null : 'Enter an Egyptian mobile number, for example 01012345678'),

  minLength: (n, label = 'This field') => (v) =>
    (String(v ?? '').trim().length >= n ? null : `${label} must be at least ${n} characters`),

  maxLength: (n, label = 'This field') => (v) =>
    (String(v ?? '').length <= n ? null : `${label} must be at most ${n} characters`),

  price: (v) => {
    const s = String(v ?? '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'Enter an amount with at most 2 decimals';
    const n = Number(s);
    if (n <= 0) return 'Must be greater than 0';
    if (n > 9999.99) return 'Must be at most 9999.99';
    return null;
  },

  rating: (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5
    ? null : 'Choose a rating from 1 to 5'),
};

/** Runs a { field: [rule] } map and returns { field: message }. */
export function validate(values, schema) {
  const errors = {};
  for (const [field, fieldRules] of Object.entries(schema)) {
    for (const rule of fieldRules) {
      const message = rule(values[field]);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }
  return errors;
}
