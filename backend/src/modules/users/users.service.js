import { knex } from '../../shared/db/knex.js';
import { withTransaction } from '../../shared/db/transaction.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import * as repo from './users.repository.js';
import { toUserDto, toAddressDto, toAddressSnapshot } from './users.mapper.js';

/** Profile plus the role-specific block, so a client never needs a second call
 *  to learn whether its restaurant is approved. */
export async function getMe(userId) {
  const user = await repo.findById(userId);
  if (!user) throw new NotFoundError('RESOURCE_NOT_FOUND');

  let restaurant = null;
  let driverProfile = null;

  if (user.role === 'RESTAURANT') {
    const r = await knex('restaurants').where({ owner_user_id: userId }).whereNull('deleted_at').first();
    if (r) {
      restaurant = {
        id: r.id, name: r.name, slug: r.slug, status: r.status,
        isAcceptingOrders: r.is_accepting_orders, rejectionReason: r.rejection_reason,
      };
    }
  } else if (user.role === 'DRIVER') {
    const d = await knex('driver_profiles').where({ user_id: userId }).first();
    if (d) {
      driverProfile = {
        id: d.id, status: d.status, availability: d.availability,
        vehicleType: d.vehicle_type, vehiclePlate: d.vehicle_plate,
        ratingAverage: d.rating_average, ratingCount: d.rating_count,
      };
    }
  }

  return { user: toUserDto(user), restaurant, driverProfile };
}

export async function updateProfile(userId, patch) {
  const columns = {};
  if (patch.fullName !== undefined) columns.full_name = patch.fullName;
  if (patch.phone !== undefined) columns.phone = patch.phone;
  if (patch.preferredLanguage !== undefined) columns.preferred_language = patch.preferredLanguage;
  const row = await repo.updateProfile(userId, columns);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toUserDto(row);
}

/* ---------------------------------------------------------------- addresses */

export async function listAddresses(userId) {
  const rows = await repo.listAddresses(userId);
  return rows.map(toAddressDto);
}

const toColumns = (input) => {
  const c = {};
  const map = {
    label: 'label', line1: 'line1', line2: 'line2', city: 'city',
    district: 'district', postalCode: 'postal_code',
    latitude: 'latitude', longitude: 'longitude',
  };
  for (const [key, column] of Object.entries(map)) {
    if (input[key] !== undefined) c[column] = input[key];
  }
  return c;
};

/** The first address becomes the default automatically, otherwise a brand-new
 *  customer's first checkout would have nothing pre-selected (BR-A7). */
export async function createAddress(userId, input) {
  return withTransaction(async (trx) => {
    const existing = await repo.countAddresses(userId, trx);
    const shouldDefault = input.isDefault === true || existing === 0;
    if (shouldDefault) await repo.clearDefault(userId, trx);
    const row = await repo.insertAddress(
      userId,
      { ...toColumns(input), is_default: shouldDefault },
      trx,
    );
    return toAddressDto(row);
  });
}

export async function updateAddress(userId, addressId, input) {
  const row = await repo.updateAddress(addressId, userId, toColumns(input));
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return toAddressDto(row);
}

/** Soft delete only: an address referenced by an order is never hard-deleted,
 *  and the order keeps its own JSONB snapshot regardless (BR-A8). */
export async function deleteAddress(userId, addressId) {
  const row = await repo.softDeleteAddress(addressId, userId);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
}

/** Setting a default clears the previous one in the same transaction, so no
 *  intermediate state with zero or two defaults is observable. */
export async function setDefaultAddress(userId, addressId) {
  return withTransaction(async (trx) => {
    const target = await repo.findAddress(addressId, userId, trx);
    if (!target) throw new NotFoundError('RESOURCE_NOT_FOUND');
    await repo.clearDefault(userId, trx);
    const row = await repo.updateAddress(addressId, userId, { is_default: true }, trx);
    return toAddressDto(row);
  });
}

/** Used by checkout. Returns the snapshot, not a live reference. */
export async function getAddressForOrder(userId, addressId, trx) {
  const row = await repo.findAddress(addressId, userId, trx);
  if (!row) throw new NotFoundError('RESOURCE_NOT_FOUND');
  return { id: row.id, snapshot: toAddressSnapshot(row) };
}

export const getUserById = repo.findById;
export const setUserStatus = repo.setStatus;
export const getUserByIdIncludingDeleted = repo.findByIdIncludingDeleted;
export const softDeleteUser = repo.softDelete;
export const restoreUser = repo.restore;
