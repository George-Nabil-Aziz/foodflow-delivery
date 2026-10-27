import { withTransaction } from '../../shared/db/transaction.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import * as repo from './options.repository.js';
import { selectOptions, unitPriceWith } from './optionSelection.js';

/* ------------------------------------------------------------------- DTOs */

export const toOptionDto = (o) => ({
  id: o.id,
  name: o.name,
  priceDelta: o.price_delta,
  isAvailable: o.is_available,
  displayOrder: o.display_order,
});

export const toGroupDto = (g) => ({
  id: g.id,
  name: g.name,
  minSelect: g.min_select,
  maxSelect: g.max_select,
  isRequired: g.min_select >= 1,
  displayOrder: g.display_order,
  options: g.options.map(toOptionDto),
});

/** Item id -> option group DTOs, for the owner list and the public menu. */
export async function groupDtosForItems(itemIds, trx) {
  const byItem = await repo.groupsForItems(itemIds, trx);
  return new Map([...byItem].map(([id, groups]) => [id, groups.map(toGroupDto)]));
}

/* ------------------------------------------------------------ owner: write */

async function assertItemOwned(restaurantId, itemId, trx) {
  const item = await repo.findOwnedItem(itemId, restaurantId, trx);
  if (!item) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return item;
}

async function ownedGroup(restaurantId, groupId, trx) {
  const group = await repo.findGroup(groupId, restaurantId, trx);
  if (!group) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return group;
}

async function groupDto(group, trx) {
  const groups = (await repo.groupsForItems([group.food_item_id], trx)).get(group.food_item_id) ?? [];
  return toGroupDto(groups.find((g) => g.id === group.id));
}

/** A group that asks for more than it offers can never be ordered (BR-IO2). */
function assertSatisfiable(minSelect, optionCount) {
  if (minSelect > optionCount) {
    throw new ValidationError('VALIDATION_ERROR', {
      details: [{
        field: 'minSelect',
        issue: `must be at most the number of options (${optionCount}).`,
      }],
    });
  }
}

export async function listGroups(restaurantId, itemId) {
  await assertItemOwned(restaurantId, itemId);
  return (await groupDtosForItems([itemId])).get(itemId) ?? [];
}

export async function createGroup(restaurantId, itemId, input) {
  return withTransaction(async (trx) => {
    await assertItemOwned(restaurantId, itemId, trx);
    assertSatisfiable(input.minSelect, input.options.length);
    const group = await repo.insertGroup(itemId, input, trx);
    await repo.insertOptions(group.id, input.options, trx);
    return groupDto(group, trx);
  });
}

export async function updateGroup(restaurantId, groupId, input) {
  return withTransaction(async (trx) => {
    const group = await ownedGroup(restaurantId, groupId, trx);
    const minSelect = input.minSelect ?? group.min_select;
    const maxSelect = input.maxSelect ?? group.max_select;
    if (maxSelect < 1 || maxSelect < minSelect) {
      throw new ValidationError('VALIDATION_ERROR', {
        details: [{ field: 'maxSelect', issue: 'must be at least 1 and at least minSelect' }],
      });
    }
    assertSatisfiable(minSelect, await repo.countLiveOptions(groupId, trx));

    const patch = { min_select: minSelect, max_select: maxSelect };
    if (input.name !== undefined) patch.name = input.name;
    if (input.displayOrder !== undefined) patch.display_order = input.displayOrder;
    const row = await repo.updateGroup(groupId, patch, trx);
    return groupDto(row, trx);
  });
}

export async function deleteGroup(restaurantId, groupId) {
  return withTransaction(async (trx) => {
    await ownedGroup(restaurantId, groupId, trx);
    await repo.softDeleteGroup(groupId, trx);
  });
}

/** Atomic, like category reorder: a half-applied order would scramble the dialog. */
export async function reorderGroups(restaurantId, itemId, entries) {
  return withTransaction(async (trx) => {
    await assertItemOwned(restaurantId, itemId, trx);
    for (const { id, displayOrder } of entries) {
      const group = await ownedGroup(restaurantId, id, trx);
      if (group.food_item_id !== itemId) throw new NotFoundError('RESOURCE_NOT_FOUND');
      await repo.updateGroup(id, { display_order: displayOrder }, trx);
    }
    return (await groupDtosForItems([itemId], trx)).get(itemId) ?? [];
  });
}

export async function createOption(restaurantId, groupId, input) {
  return withTransaction(async (trx) => {
    const group = await ownedGroup(restaurantId, groupId, trx);
    const count = await repo.countLiveOptions(groupId, trx);
    await repo.insertOptions(groupId, [{ ...input, displayOrder: input.displayOrder ?? count }], trx);
    return groupDto(group, trx);
  });
}

async function ownedOption(restaurantId, optionId, trx) {
  const option = await repo.findOption(optionId, restaurantId, trx);
  if (!option) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return option;
}

export async function updateOption(restaurantId, optionId, input) {
  return withTransaction(async (trx) => {
    const option = await ownedOption(restaurantId, optionId, trx);
    const patch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.priceDelta !== undefined) patch.price_delta = input.priceDelta;
    if (input.isAvailable !== undefined) patch.is_available = input.isAvailable;
    if (input.displayOrder !== undefined) patch.display_order = input.displayOrder;
    await repo.updateOption(optionId, patch, trx);
    return groupDto(await repo.findGroup(option.group_id, restaurantId, trx), trx);
  });
}

/** "We ran out of extra cheese": one field, no form, like item availability. */
export const setOptionAvailability = (restaurantId, optionId, isAvailable) =>
  updateOption(restaurantId, optionId, { isAvailable });

/**
 * Deleting is refused when it would leave fewer options than the group's
 * minimum: that would make the item impossible to order. Switch the option off
 * instead, or lower the minimum first (BR-IO2).
 */
export async function deleteOption(restaurantId, optionId) {
  return withTransaction(async (trx) => {
    const option = await ownedOption(restaurantId, optionId, trx);
    const group = await repo.findGroup(option.group_id, restaurantId, trx);
    const remaining = (await repo.countLiveOptions(group.id, trx)) - 1;
    if (remaining < group.min_select) {
      throw new ConflictError('OPTION_GROUP_UNSATISFIABLE', {
        details: [{
          field: 'id',
          issue: `"${group.name}" needs at least ${group.min_select} option(s). Lower its minimum or switch this option off instead.`,
        }],
      });
    }
    await repo.softDeleteOption(optionId, trx);
    return groupDto(group, trx);
  });
}

export async function reorderOptions(restaurantId, groupId, entries) {
  return withTransaction(async (trx) => {
    const group = await ownedGroup(restaurantId, groupId, trx);
    for (const { id, displayOrder } of entries) {
      const option = await ownedOption(restaurantId, id, trx);
      if (option.group_id !== groupId) throw new NotFoundError('RESOURCE_NOT_FOUND');
      await repo.updateOption(id, { display_order: displayOrder }, trx);
    }
    return groupDto(group, trx);
  });
}

/* ------------------------------------------------- cross-module interface */

/** Live groups by item id plus every referenced option (deleted ones too), for cart revalidation. */
export async function getOptionContext(itemIds, optionIds, trx) {
  const [groupsByItem, optionRows] = await Promise.all([
    repo.groupsForItems(itemIds, trx),
    repo.findOptionsByIds(optionIds, trx),
  ]);
  return { groupsByItem, optionsById: new Map(optionRows.map((o) => [o.id, o])) };
}

/**
 * Judges and prices a choice of options for each line. The one enforcement
 * point for add-to-cart, checkout and admin placement, so no path can order an
 * item without a required choice or with an unavailable one (BR-IO3..IO5).
 *
 * @param {{ foodItemId: string, name: string, basePrice: string, optionIds?: string[] }[]} lines
 * @returns {Promise<{ options: object[], unitPrice: string }[]>} aligned with `lines`
 */
export async function resolveSelections(lines, trx) {
  const groupsByItem = await repo.groupsForItems([...new Set(lines.map((l) => l.foodItemId))], trx);
  const details = [];
  const resolved = lines.map((line, index) => {
    const { chosen, problems } = selectOptions(groupsByItem.get(line.foodItemId) ?? [], line.optionIds);
    for (const p of problems) {
      details.push({
        field: lines.length > 1 ? `items.${index}.optionIds` : 'optionIds',
        issue: `"${line.name}": ${p.message}`,
        foodItemId: line.foodItemId,
        code: p.code,
      });
    }
    return { options: chosen, unitPrice: unitPriceWith(line.basePrice, chosen) };
  });
  if (details.length) throw new ValidationError('ITEM_OPTIONS_INVALID', { details });
  return resolved;
}
