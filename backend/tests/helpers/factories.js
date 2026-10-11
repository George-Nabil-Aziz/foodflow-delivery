import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { knex } from '../../src/shared/db/knex.js';
import { signAccessToken } from '../../src/shared/jwt.js';
import { config } from '../../src/config/index.js';

export const TEST_PASSWORD = 'Passw0rd!test';

let seq = 0;
const uniq = (prefix) => `${prefix}${(seq += 1)}-${crypto.randomBytes(3).toString('hex')}`;

/** Hashed once: bcrypt at cost 12 is deliberately slow, and hashing per
 *  fixture would dominate the suite's runtime. */
let cachedHash = null;
async function passwordHash() {
  if (!cachedHash) cachedHash = await bcrypt.hash(TEST_PASSWORD, 10);
  return cachedHash;
}

export async function makeUser({ role = 'CUSTOMER', status = 'ACTIVE', email, fullName, phone, deletedAt } = {}) {
  const [user] = await knex('users')
    .insert({
      email: email ?? `${uniq('user')}@example.com`,
      password_hash: await passwordHash(),
      full_name: fullName ?? 'Test Person',
      phone: phone ?? '+201000000000',
      role,
      status,
      deleted_at: deletedAt ?? null,
    })
    .returning('*');
  return user;
}

export const tokenFor = (user) => signAccessToken(user);
export const authHeader = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

export async function makeAddress(user, { isDefault = true, ...overrides } = {}) {
  const [row] = await knex('customer_addresses')
    .insert({
      user_id: user.id,
      label: 'Home',
      line1: '4412 King Fahd Road',
      city: 'Riyadh',
      district: 'Al Olaya',
      latitude: 24.69,
      longitude: 46.68,
      is_default: isDefault,
      ...overrides,
    })
    .returning('*');
  return row;
}

/** An always-open restaurant by default, so ordinary tests never fail because
 *  the suite happened to run at midnight. */
export async function makeRestaurant({
  owner,
  status = 'ACTIVE',
  isAcceptingOrders = true,
  deliveryFee = '12.00',
  minimumOrderAmount = '30.00',
  name,
  cuisineType = 'LEVANTINE',
  closedToday = false,
  hours = 'ALL_DAY',
} = {}) {
  const ownerUser = owner ?? (await makeUser({ role: 'RESTAURANT' }));
  const restaurantName = name ?? `Restaurant ${uniq('r')}`;
  const [restaurant] = await knex('restaurants')
    .insert({
      owner_user_id: ownerUser.id,
      name: restaurantName,
      slug: restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      cuisine_type: cuisineType,
      delivery_fee: deliveryFee,
      minimum_order_amount: minimumOrderAmount,
      status,
      is_accepting_orders: isAcceptingOrders,
      latitude: 24.695,
      longitude: 46.68,
      city: 'Riyadh',
      district: 'Al Olaya',
    })
    .returning('*');

  const rows = [];
  for (let day = 0; day < 7; day += 1) {
    const closed = closedToday || hours === 'CLOSED';
    rows.push({
      restaurant_id: restaurant.id,
      day_of_week: day,
      is_closed: closed,
      opens_at: closed ? null : '00:00',
      closes_at: closed ? null : '23:59',
    });
  }
  await knex('restaurant_hours').insert(rows);

  return { restaurant, owner: ownerUser };
}

export async function makeCategory(restaurant, { name, isActive = true } = {}) {
  const [row] = await knex('menu_categories')
    .insert({
      restaurant_id: restaurant.id,
      name: name ?? `Category ${uniq('c')}`,
      is_active: isActive,
    })
    .returning('*');
  return row;
}

export async function makeItem(restaurant, category, { name, price = '58.00', isAvailable = true, deletedAt } = {}) {
  const [row] = await knex('food_items')
    .insert({
      restaurant_id: restaurant.id,
      category_id: category.id,
      name: name ?? `Item ${uniq('i')}`,
      description: 'A test dish.',
      price,
      is_available: isAvailable,
      deleted_at: deletedAt ?? null,
    })
    .returning('*');
  return row;
}

/** A complete, orderable restaurant: owner, category and two items. */
export async function makeStockedRestaurant(options = {}) {
  const { restaurant, owner } = await makeRestaurant(options);
  const category = await makeCategory(restaurant);
  const main = await makeItem(restaurant, category, { name: `Mixed Grill ${uniq('m')}`, price: '58.00' });
  const soup = await makeItem(restaurant, category, { name: `Lentil Soup ${uniq('s')}`, price: '18.00' });
  return { restaurant, owner, category, main, soup };
}

export async function makeDriver({ status = 'ACTIVE', availability = 'AVAILABLE', latitude = 24.695, longitude = 46.681 } = {}) {
  const user = await makeUser({ role: 'DRIVER' });
  const [profile] = await knex('driver_profiles')
    .insert({
      user_id: user.id,
      vehicle_type: 'MOTORCYCLE',
      vehicle_plate: 'RUH 0001',
      status,
      availability,
      current_latitude: latitude,
      current_longitude: longitude,
      location_updated_at: knex.fn.now(),
      approved_at: status === 'ACTIVE' ? knex.fn.now() : null,
    })
    .returning('*');
  return { user, profile };
}

export async function makeCart(customer, restaurant, lines = []) {
  const [cart] = await knex('carts')
    .insert({ customer_user_id: customer.id, restaurant_id: restaurant?.id ?? null, status: 'ACTIVE' })
    .returning('*');
  for (const line of lines) {
    await knex('cart_items').insert({
      cart_id: cart.id,
      food_item_id: line.item.id,
      quantity: line.quantity ?? 1,
      price_seen_at_add: line.priceSeenAtAdd ?? line.item.price,
    });
  }
  return cart;
}

/**
 * An order in any lifecycle state. Timestamps are set explicitly, and stale
 * fixtures are back-dated rather than waited for - no test sleeps.
 */
export async function makeOrder({
  customer,
  restaurant,
  driver = null,
  status = 'PENDING',
  items = [{ name: 'Mixed Grill', unitPrice: '58.00', quantity: 2 }],
  address,
  placedAt,
  confirmedAt,
  pickedUpAt,
  deliveredAt,
  dispatchState,
  foodItemId = null,
} = {}) {
  const subtotal = items
    .reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0)
    .toFixed(2);
  const fee = restaurant.delivery_fee;
  const tax = (Math.round(Number(subtotal) * config.taxRate * 100) / 100).toFixed(2);
  const total = (Number(subtotal) + Number(fee) + Number(tax)).toFixed(2);

  const snapshot = address
    ? { line1: address.line1, city: address.city, district: address.district }
    : { line1: '4412 King Fahd Road', city: 'Riyadh', district: 'Al Olaya' };

  const timestamps = {};
  const reached = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const idx = reached.indexOf(status);
  if (idx >= 0) timestamps.confirmed_at = confirmedAt ?? knex.fn.now();
  if (idx >= 1) timestamps.preparing_at = knex.fn.now();
  if (idx >= 2) timestamps.ready_at = knex.fn.now();
  if (idx >= 3) timestamps.picked_up_at = pickedUpAt ?? knex.fn.now();
  if (idx >= 4) timestamps.delivered_at = deliveredAt ?? knex.fn.now();
  if (status === 'CANCELLED') {
    timestamps.cancelled_at = knex.fn.now();
    timestamps.cancelled_by = 'CUSTOMER';
    timestamps.cancellation_reason = 'CUSTOMER_CHANGED_MIND';
  }

  const [order] = await knex('orders')
    .insert({
      order_number: `FF-20260922-${uniq('X').toUpperCase().slice(0, 6).padEnd(6, '0')}`,
      customer_user_id: customer.id,
      restaurant_id: restaurant.id,
      driver_user_id: driver?.id ?? null,
      delivery_address_id: address?.id ?? null,
      delivery_address_snapshot: JSON.stringify(snapshot),
      restaurant_name_snapshot: restaurant.name,
      status,
      dispatch_state: dispatchState ?? (idx >= 0 ? 'UNASSIGNED' : 'NOT_REQUIRED'),
      subtotal,
      delivery_fee: fee,
      tax_amount: tax,
      total_amount: total,
      placed_at: placedAt ?? knex.fn.now(),
      ...timestamps,
    })
    .returning('*');

  await knex('order_items').insert(
    items.map((i) => ({
      order_id: order.id,
      food_item_id: i.foodItemId ?? foodItemId,
      item_name_snapshot: i.name,
      item_description_snapshot: 'A test dish.',
      unit_price: i.unitPrice,
      quantity: i.quantity,
      line_total: (Number(i.unitPrice) * i.quantity).toFixed(2),
    })),
  );

  await knex('order_status_events').insert({
    order_id: order.id,
    from_status: null,
    to_status: 'PENDING',
    actor_user_id: customer.id,
    actor_role: 'CUSTOMER',
  });

  return order;
}

export async function makeAssignment(order, driverUser, { status = 'OFFERED', expiresAt } = {}) {
  const [row] = await knex('delivery_assignments')
    .insert({
      order_id: order.id,
      driver_user_id: driverUser.id,
      status,
      expires_at: expiresAt ?? new Date(Date.now() + 90_000),
    })
    .returning('*');
  return row;
}

export async function makeReview(order, customer, { restaurantRating = 5, driverRating = null, status = 'PUBLISHED', createdAt } = {}) {
  const [row] = await knex('reviews')
    .insert({
      order_id: order.id,
      customer_user_id: customer.id,
      restaurant_id: order.restaurant_id,
      driver_user_id: order.driver_user_id,
      restaurant_rating: restaurantRating,
      driver_rating: driverRating,
      status,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .returning('*');
  return row;
}
