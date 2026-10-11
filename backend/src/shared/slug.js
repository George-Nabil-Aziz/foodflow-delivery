/** URL-safe slug. Stable once assigned, so shared links never break. */
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'restaurant';
}

/** Appends -2, -3 ... until the candidate is free. */
export function nextSlugCandidate(base, attempt) {
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}
