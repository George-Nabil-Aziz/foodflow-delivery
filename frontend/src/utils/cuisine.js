/**
 * How each cuisine looks: the cover colours (main.css) and an icon. Purely
 * presentational - the cuisine itself always comes from the server.
 */
const STYLES = {
  EGYPTIAN: { cover: 'cover-egyptian', icon: '🧆', label: 'Egyptian' },
  LEVANTINE: { cover: 'cover-levantine', icon: '🥙', label: 'Levantine' },
  ITALIAN: { cover: 'cover-italian', icon: '🍝', label: 'Italian' },
  INDIAN: { cover: 'cover-indian', icon: '🍛', label: 'Indian' },
  BURGERS: { cover: 'cover-burgers', icon: '🍔', label: 'Burgers' },
  SEAFOOD: { cover: 'cover-seafood', icon: '🐟', label: 'Seafood' },
  ASIAN: { cover: 'cover-asian', icon: '🍜', label: 'Asian' },
  DESSERTS: { cover: 'cover-desserts', icon: '🍰', label: 'Desserts' },
  COFFEE: { cover: 'cover-coffee', icon: '☕', label: 'Coffee' },
  HEALTHY: { cover: 'cover-healthy', icon: '🥗', label: 'Healthy' },
};
const FALLBACK = { cover: 'cover-default', icon: '🍽️', label: 'Other' };

export const cuisineStyle = (type) => STYLES[type] ?? { ...FALLBACK, label: FALLBACK.label };

/** A stable tile colour for an item, so a menu reads as varied but never random. */
export function tileClass(name = '') {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) % 997;
  return `tile-${hash % 6}`;
}
