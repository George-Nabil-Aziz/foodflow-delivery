/**
 * Server-side PII masking (security 9). Applied when building the DTO, never
 * in the browser: a client-side mask still transmits the full value.
 */
export function maskPhone(phone) {
  if (!phone) return null;
  const s = String(phone);
  if (s.length <= 8) return `${s.slice(0, 2)}****`;
  return `${s.slice(0, 5)}****${s.slice(-4)}`;
}

/** "Sara Idris" becomes "Sara I." for public review payloads (BR-V8). */
export function displayName(fullName) {
  if (!fullName) return 'Customer';
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function firstName(fullName) {
  if (!fullName) return 'Customer';
  return String(fullName).trim().split(/\s+/)[0];
}
