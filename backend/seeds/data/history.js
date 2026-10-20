/**
 * A year of history for the development seed: join dates, past orders and
 * reviews, so lists sort, page and read like a platform that has been running
 * since January 2026 rather than one created a second ago.
 *
 * Everything is drawn from a seeded generator, so every run of the seed
 * produces the same rows; only the order dates stretch to the day it runs.
 */

/** mulberry32: a tiny deterministic PRNG. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (list) => list[Math.floor(next() * list.length)];
  return { next, int, pick };
}

export const YEAR_START = new Date('2026-01-01T08:00:00Z');

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** A random instant in [from, to]. */
export const between = (rng, from, to) => new Date(from.getTime() + rng.next() * (to.getTime() - from.getTime()));

export const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * MINUTE);

/** "2026-03-14T…" -> "20260314", for order numbers. */
export const ymd = (date) => date.toISOString().slice(0, 10).replace(/-/g, '');

export const DISTRICTS = [
  ['Cairo', 'Zamalek'], ['Cairo', 'Heliopolis'], ['Cairo', 'Nasr City'], ['Cairo', 'Maadi'],
  ['Cairo', 'Garden City'], ['Cairo', 'New Cairo'], ['Giza', 'Dokki'], ['Giza', 'Mohandessin'],
  ['Giza', 'Agouza'], ['Giza', 'Sheikh Zayed'],
];

export const STREETS = [
  'Abu El Feda Street', 'Baghdad Street', 'Tahrir Street', 'Road 9', 'Gameat El Dowal Street',
  'Mohamed Mazhar Street', 'Makram Ebeid Street', 'Abbas El Akkad Street', 'Shehab Street', 'El Merghany Street',
];

/** Cancellations that can happen before the restaurant starts cooking, with who makes them. */
export const CANCELLATIONS = [
  { by: 'CUSTOMER', reason: 'CUSTOMER_CHANGED_MIND', note: 'Plans changed, eating out instead.' },
  { by: 'CUSTOMER', reason: 'CUSTOMER_ORDERED_BY_MISTAKE', note: 'Picked the wrong branch.' },
  { by: 'RESTAURANT', reason: 'RESTAURANT_TOO_BUSY', note: 'Kitchen at capacity tonight.' },
  { by: 'RESTAURANT', reason: 'OUT_OF_STOCK', note: 'Ran out of the main dish.' },
  { by: 'RESTAURANT', reason: 'RESTAURANT_CLOSED', note: 'Closed early for maintenance.' },
  { by: 'SYSTEM', reason: 'ACCEPT_TIMEOUT', note: null },
  { by: 'ADMIN', reason: 'ADMIN_INTERVENTION', note: 'Duplicate order placed by mistake.' },
];

/** Review comments by how the customer felt; null means "rated, said nothing". */
export const COMMENTS = {
  happy: [
    'Arrived hot and on time. Will order again.',
    'Best meal I have had this month, generous portions.',
    'Driver was polite and the food was perfect.',
    'Exactly as described, packaging was spotless.',
    'Fast delivery and everything tasted fresh.',
    'My family loved it. Great value for the price.',
    'Consistently good every time I order.',
    'The sauce was amazing, five stars from me.',
    'Came earlier than expected and still piping hot.',
    'Lovely food, the dessert was a nice surprise.',
    null,
    null,
  ],
  mixed: [
    'Food was fine but took longer than the estimate.',
    'Tasty, though the portion was smaller than last time.',
    'Good overall, but one item was missing the extra sauce.',
    'Decent. Nothing special, nothing wrong.',
    'Arrived lukewarm, flavour was still okay.',
    'Driver could not find the building at first, food was good.',
    'A bit too salty for me, otherwise fine.',
    'Okay for the price. Would try something else next time.',
    null,
  ],
  unhappy: [
    'Over an hour late and the food was cold.',
    'Order was wrong, got someone else\'s drink.',
    'Very oily and the bread was stale.',
    'Packaging leaked all over the bag.',
    'Too expensive for what you get, portions were tiny.',
    'Driver was rude and left the order at the wrong door.',
    'The chicken was undercooked. Not ordering again.',
    'Half the fries were missing and nobody answered the phone.',
    'Waited 90 minutes, then the restaurant said it was on its way for another 30.',
  ],
};

/** Reviews a moderator took down, with why. */
export const HIDDEN_REVIEWS = [
  { comment: 'Terrible!!! Everyone who works there is an idiot.', reason: 'Abusive language toward staff' },
  { comment: 'Order from my page instead, better prices, link in bio.', reason: 'Spam / advertising' },
  { comment: 'The delivery guy Ahmed lives on my street, here is his number...', reason: 'Shares personal information' },
  { comment: 'Never ordered here, just giving one star.', reason: 'Not based on a real experience' },
  { comment: 'Worst place ever, I hope they shut down, total garbage people.', reason: 'Abusive language toward staff' },
];

/** A restaurant rating for a mood, and a driver rating that usually follows it. */
export function ratingsFor(rng, mood) {
  const restaurant = mood === 'happy' ? rng.pick([4, 5, 5, 5])
    : mood === 'mixed' ? rng.pick([2, 3, 3, 3, 4])
      : rng.pick([1, 1, 2]);
  // Most customers rate the driver too; usually close to how the meal went.
  const driver = rng.next() < 0.2 ? null
    : Math.min(5, Math.max(1, restaurant + rng.pick([-1, 0, 0, 1])));
  return { restaurant, driver };
}

export function moodFor(rng) {
  const r = rng.next();
  if (r < 0.45) return 'happy';
  if (r < 0.72) return 'mixed';
  return 'unhappy';
}
