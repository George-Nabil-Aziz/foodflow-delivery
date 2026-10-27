/**
 * Option selection helpers for the add-to-cart dialog.
 *
 * These only PREVIEW: they let the dialog enable its button and show a running
 * price while the customer chooses. The server re-judges every choice and
 * computes every price (spec-15); nothing here is sent as a price. Amounts are
 * summed in integer cents, so the preview never shows 0.1 + 0.2 = 0.30000000004.
 */
const toCents = (value) => Math.round(Number(value ?? 0) * 100);
const fromCents = (cents) => (cents / 100).toFixed(2);

/** `selected` is a Set (or array) of option ids. */
export function previewUnitPrice(basePrice, groups, selected) {
  const ids = new Set(selected);
  let cents = toCents(basePrice);
  for (const g of groups ?? []) {
    for (const o of g.options) if (ids.has(o.id)) cents += toCents(o.priceDelta);
  }
  return fromCents(cents);
}

/** A preview line total, in cents so it carries no float error. */
export const previewLineTotal = (unitPrice, quantity) => fromCents(toCents(unitPrice) * quantity);

/** Group id -> the message to show, for groups whose min/max the choice breaks. */
export function groupProblems(groups, selected) {
  const ids = new Set(selected);
  const problems = {};
  for (const g of groups ?? []) {
    const n = g.options.filter((o) => ids.has(o.id)).length;
    if (n < g.minSelect) problems[g.id] = 'min';
    else if (n > g.maxSelect) problems[g.id] = 'max';
  }
  return problems;
}

/** The options a customer can pick from: unavailable ones are shown but not selectable. */
export const isSelectable = (option) => option.isAvailable !== false;

/** True when no available option can satisfy the group, so the item cannot be ordered. */
export function cannotBeOrdered(groups) {
  return (groups ?? []).some((g) => g.options.filter(isSelectable).length < g.minSelect);
}

/** "Size: Large, Extras: Cheese, Bacon" for compact lists. */
export function summarizeOptions(options) {
  const byGroup = new Map();
  for (const o of options ?? []) {
    const key = o.groupName ?? '';
    byGroup.set(key, [...(byGroup.get(key) ?? []), o.name]);
  }
  return [...byGroup].map(([group, names]) => (group ? `${group}: ${names.join(', ')}` : names.join(', '))).join(' · ');
}
