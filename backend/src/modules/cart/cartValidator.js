import { CART_ISSUES } from '../../shared/constants.js';
import { money } from '../../shared/money.js';
import { selectOptions, unitPriceWith, CART_ISSUE_FOR } from '../menu/index.js';

/**
 * Pure cart revalidation (BR-C8). Given stored lines and live item rows, it
 * reports per-line issues. Being pure is what makes the whole staleness matrix
 * cheap to test.
 *
 * The cart stores no prices (ADR-008), so `unitPrice` here is always the LIVE
 * price: the item's price plus the deltas of the options still on the menu.
 * `price_seen_at_add` exists solely to detect a change and never enters a
 * total.
 *
 * Options (spec-15): a line carries `optionIds`. `groupsByItem` holds each
 * item's live groups and `optionsById` every referenced option, deleted ones
 * too, so a removed option can still be named in the issue it causes.
 */
export function validateLines(
  lines, liveItems,
  { restaurantOrderable = true, groupsByItem = new Map(), optionsById = new Map() } = {},
) {
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
        options: [],
        imageUrl: null,
        isAvailable: false,
        issues: [CART_ISSUES.ITEM_REMOVED],
      };
    }

    if (!item.is_available) issues.push(CART_ISSUES.ITEM_UNAVAILABLE);

    const optionIds = line.optionIds ?? [];
    const { chosen, problems } = selectOptions(groupsByItem.get(item.id) ?? [], optionIds);
    for (const p of problems) issues.push(CART_ISSUE_FOR[p.code]);
    const unitPrice = unitPriceWith(item.price, chosen);

    if (money.compare(unitPrice, line.price_seen_at_add) !== 0) {
      issues.push(CART_ISSUES.PRICE_CHANGED);
    }
    if (!restaurantOrderable) {
      // Restaurant-level unavailability is reported at the cart level rather
      // than per line, so it is not duplicated across every row.
    }

    // Live choices first, then those that are gone (shown, flagged, not priced).
    const liveIds = new Set(chosen.map((o) => o.optionId));
    const options = [
      ...chosen.map((o) => ({
        optionId: o.optionId, groupName: o.groupName, name: o.name, priceDelta: o.priceDelta,
        isAvailable: o.isAvailable, isRemoved: false,
      })),
      ...optionIds.filter((id) => !liveIds.has(id)).map((id) => {
        const row = optionsById.get(id);
        return {
          optionId: id, groupName: row?.group_name ?? null, name: row?.name ?? 'Option no longer offered',
          priceDelta: row?.price_delta ?? money.ZERO, isAvailable: false, isRemoved: true,
        };
      }),
    ];

    return {
      id: line.id,
      foodItemId: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.image_url,
      basePrice: item.price,
      unitPrice,
      priceSeenAtAdd: line.price_seen_at_add,
      quantity: line.quantity,
      lineTotal: money.multiply(unitPrice, line.quantity),
      notes: line.notes,
      options,
      optionIds,
      isAvailable: item.is_available,
      issues: [...new Set(issues)],
    };
  });
}

export function collectIssues(validatedLines) {
  return [...new Set(validatedLines.flatMap((l) => l.issues))];
}
