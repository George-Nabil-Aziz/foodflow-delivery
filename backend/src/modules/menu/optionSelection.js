import { CART_ISSUES } from '../../shared/constants.js';
import { money } from '../../shared/money.js';

/**
 * Pure option selection rules (BR-IO3..IO5). Given an item's LIVE option
 * groups and the option ids a customer chose, it says what was chosen, what is
 * wrong with the choice, and what the unit price comes to. Being pure is what
 * lets one function judge cart add, cart revalidation, checkout and admin
 * placement identically.
 *
 * `groups` are camel-free DB rows with their live options attached:
 *   { id, name, min_select, max_select, display_order,
 *     options: [{ id, name, price_delta, is_available, display_order }] }
 *
 * Problem codes:
 *   OPTION_REMOVED      the id is not a live option of this item
 *   OPTION_UNAVAILABLE  the option exists but is switched off
 *   GROUP_MIN / GROUP_MAX  the group's min/max (incl. a required group left empty)
 */
export const PROBLEMS = {
  REMOVED: 'OPTION_REMOVED',
  UNAVAILABLE: 'OPTION_UNAVAILABLE',
  GROUP_MIN: 'GROUP_MIN',
  GROUP_MAX: 'GROUP_MAX',
};

/** The cart issue a problem is reported as (BR-IO8). */
export const CART_ISSUE_FOR = {
  [PROBLEMS.REMOVED]: CART_ISSUES.OPTION_REMOVED,
  [PROBLEMS.UNAVAILABLE]: CART_ISSUES.OPTION_UNAVAILABLE,
  [PROBLEMS.GROUP_MIN]: CART_ISSUES.OPTIONS_CHANGED,
  [PROBLEMS.GROUP_MAX]: CART_ISSUES.OPTIONS_CHANGED,
};

const byOrder = (a, b) => a.display_order - b.display_order;

export function selectOptions(groups, optionIds) {
  const ids = [...new Set(optionIds ?? [])];
  const known = new Map();
  for (const g of groups) for (const o of g.options) known.set(o.id, { group: g, option: o });

  const problems = [];
  const counts = new Map();
  const picked = [];

  for (const id of ids) {
    const hit = known.get(id);
    if (!hit) {
      problems.push({ code: PROBLEMS.REMOVED, optionId: id, message: 'An option you chose is no longer offered.' });
      continue;
    }
    counts.set(hit.group.id, (counts.get(hit.group.id) ?? 0) + 1);
    picked.push(hit);
    if (!hit.option.is_available) {
      problems.push({
        code: PROBLEMS.UNAVAILABLE, optionId: id, groupId: hit.group.id,
        message: `"${hit.option.name}" (${hit.group.name}) is currently unavailable.`,
      });
    }
  }

  for (const g of [...groups].sort(byOrder)) {
    const n = counts.get(g.id) ?? 0;
    if (n < g.min_select) {
      problems.push({
        code: PROBLEMS.GROUP_MIN, groupId: g.id,
        message: g.min_select === 1 && g.max_select === 1
          ? `Choose one from "${g.name}".`
          : `Choose at least ${g.min_select} from "${g.name}".`,
      });
    } else if (n > g.max_select) {
      problems.push({
        code: PROBLEMS.GROUP_MAX, groupId: g.id,
        message: `Choose at most ${g.max_select} from "${g.name}".`,
      });
    }
  }

  const groupOrder = new Map([...groups].sort(byOrder).map((g, i) => [g.id, i]));
  const chosen = picked
    .sort((a, b) => groupOrder.get(a.group.id) - groupOrder.get(b.group.id) || byOrder(a.option, b.option))
    .map(({ group, option }) => ({
      optionId: option.id,
      groupId: group.id,
      groupName: group.name,
      name: option.name,
      priceDelta: option.price_delta,
      isAvailable: option.is_available,
    }));

  return { chosen, problems };
}

/** Base price plus the chosen deltas, as a 2-decimal string. */
export const unitPriceWith = (basePrice, chosen) =>
  money.add(basePrice, chosen.length ? money.sum(chosen.map((o) => o.priceDelta)) : money.ZERO);

/**
 * The key that decides whether two adds are the same cart line (BR-IO6):
 * identical options (order-insensitive) and an identical note. A plain line
 * is '' so lines created before options existed keep their key.
 */
export function lineKeyOf(optionIds, note) {
  const ids = [...new Set(optionIds ?? [])].sort();
  const text = note ?? '';
  return ids.length === 0 && text === '' ? '' : `${ids.join(',')}|${text}`;
}

/** An empty or blank note is no note. */
export const normalizeNote = (note) => {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  return trimmed === '' ? null : trimmed;
};
