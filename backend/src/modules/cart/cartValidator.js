import { CART_ISSUES } from '../../shared/constants.js';
import { money } from '../../shared/money.js';

/**
 * Pure cart revalidation (BR-C8). Given stored lines and live item rows, it
 * reports per-line issues. Being pure is what makes the whole staleness matrix
 * cheap to test.
 *
 * The cart stores no prices (ADR-008), so `unitPrice` here is always the LIVE
 * price. `price_seen_at_add` exists solely to detect a change and never enters
 * a total.
 */
export function validateLines(lines, liveItems, { restaurantOrderable = true } = {}) {
  const byId = new Map(liveItems.map((i) => [i.id, i]));

  return lines.map((line) => {
    const item = byId.get(line.food_item_id);
    const issues = [];

    if (!item || item.deleted_at) {
      return {
        id: line.id,
        foodItemId: line.food_item_id,
        name: item?.name ?? 'Item no longer offered',
        description: null,
        unitPrice: money.ZERO,
        quantity: line.quantity,
        lineTotal: money.ZERO,
        notes: line.notes,
        imageUrl: null,
        isAvailable: false,
        issues: [CART_ISSUES.ITEM_REMOVED],
      };
    }

    if (!item.is_available) issues.push(CART_ISSUES.ITEM_UNAVAILABLE);
    if (money.compare(item.price, line.price_seen_at_add) !== 0) {
      issues.push(CART_ISSUES.PRICE_CHANGED);
    }
    if (!restaurantOrderable) {
      // Restaurant-level unavailability is reported at the cart level rather
      // than per line, so it is not duplicated across every row.
    }

    return {
      id: line.id,
      foodItemId: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.image_url,
      unitPrice: item.price,
      priceSeenAtAdd: line.price_seen_at_add,
      quantity: line.quantity,
      lineTotal: money.multiply(item.price, line.quantity),
      notes: line.notes,
      isAvailable: item.is_available,
      issues,
    };
  });
}

export function collectIssues(validatedLines) {
  return [...new Set(validatedLines.flatMap((l) => l.issues))];
}
