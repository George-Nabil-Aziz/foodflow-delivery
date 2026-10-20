import { request as pwRequest } from '@playwright/test';
import { API_URL } from '../../playwright.config.js';

/**
 * Thin API client used to arrange preconditions.
 *
 * A scenario's steps are driven through the browser; what a scenario merely
 * *gives* ("a customer has an order in PREPARING") is arranged here. Clicking
 * through six screens to reach a starting state makes a test slow and makes its
 * failures ambiguous — you cannot tell the arrangement from the assertion.
 */

let ctx = null;

export async function api() {
  if (!ctx) ctx = await pwRequest.newContext({ baseURL: API_URL });
  return ctx;
}

export async function disposeApi() {
  await ctx?.dispose();
  ctx = null;
}

const unwrap = async (res, what) => {
  const body = await res.json().catch(() => ({}));
  if (!body.success) {
    throw new Error(`${what} failed (${res.status()}): ${JSON.stringify(body.error ?? body)}`);
  }
  return body.data;
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** Randomised so a rerun never collides with a previous run's rows. */
let n = 0;
export const uniqueEmail = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${(n += 1)}@example.com`;

export const PASSWORD = 'Passw0rd!e2e';
export const SEED = {
  adminEmail: 'sayed.hanafy@foodflow.com',
  adminPassword: 'Admin123!seed',
  userPassword: 'Passw0rd!seed',
  restA: 'Olive Grill',
  restB: 'Pasta House',
  ownerA: 'olive.grill@foodflow.com',
  ownerB: 'pasta.house@foodflow.com',
};

export async function login(email, password) {
  const c = await api();
  const data = await unwrap(
    await c.post('/api/auth/login', { data: { email, password } }),
    `login ${email}`,
  );
  return { ...data, token: data.accessToken, email };
}

export const loginAdmin = () => login(SEED.adminEmail, SEED.adminPassword);

export async function registerCustomer({ fullName = 'E2E Customer' } = {}) {
  const c = await api();
  const email = uniqueEmail('customer');
  const data = await unwrap(
    await c.post('/api/auth/register', {
      data: { email, password: PASSWORD, fullName, phone: '01001234567', role: 'CUSTOMER' },
    }),
    'register customer',
  );
  return { ...data, token: data.accessToken, email, password: PASSWORD };
}

export async function registerOwner({ restaurantName = 'E2E Kitchen' } = {}) {
  const c = await api();
  const email = uniqueEmail('owner');
  const data = await unwrap(
    await c.post('/api/auth/register', {
      data: {
        email, password: PASSWORD, fullName: 'E2E Owner', phone: '01002234567',
        role: 'RESTAURANT', restaurantName,
      },
    }),
    'register owner',
  );
  return { ...data, token: data.accessToken, email, password: PASSWORD };
}

export async function addAddress(token, overrides = {}) {
  const c = await api();
  return unwrap(
    await c.post('/api/addresses', {
      headers: auth(token),
      data: {
        label: 'Home',
        line1: '12 Shagaret El Dor Street',
        city: 'Cairo',
        district: 'Zamalek',
        latitude: 30.065,
        longitude: 31.221,
        isDefault: true,
        ...overrides,
      },
    }),
    'add address',
  );
}

export async function findRestaurant(name) {
  const c = await api();
  const data = await unwrap(await c.get(`/api/restaurants?q=${encodeURIComponent(name)}`), 'find restaurant');
  const hit = data.find((r) => r.name === name);
  if (!hit) throw new Error(`restaurant "${name}" is not in the public listing`);
  return hit;
}

export async function menuOf(restaurantId) {
  const c = await api();
  const categories = await unwrap(await c.get(`/api/restaurants/${restaurantId}/menu`), 'menu');
  return categories.flatMap((cat) => cat.items);
}

export async function addToCart(token, foodItemId, quantity = 1) {
  const c = await api();
  return unwrap(
    await c.post('/api/cart/items', { headers: auth(token), data: { foodItemId, quantity } }),
    'add to cart',
  );
}

export async function clearCart(token) {
  const c = await api();
  await c.delete('/api/cart', { headers: auth(token) });
}

export async function checkout(token, addressId, customerNote) {
  const c = await api();
  return unwrap(
    await c.post('/api/orders', {
      headers: auth(token),
      data: { addressId, paymentMethod: 'CASH_ON_DELIVERY', ...(customerNote ? { customerNote } : {}) },
    }),
    'checkout',
  );
}

/** Places an order at `restaurantName` for a fresh customer, in one call. */
export async function placeOrder({ restaurantName = SEED.restA, items = 1, customer } = {}) {
  const buyer = customer ?? (await registerCustomer());
  if (!customer) await addAddress(buyer.token);
  const c = await api();
  const addresses = await unwrap(await c.get('/api/addresses', { headers: auth(buyer.token) }), 'addresses');

  const restaurant = await findRestaurant(restaurantName);
  const menu = (await menuOf(restaurant.id)).filter((i) => i.isAvailable);
  await clearCart(buyer.token);
  for (const item of menu.slice(0, items)) await addToCart(buyer.token, item.id, 1);

  const order = await checkout(buyer.token, addresses[0].id);
  return { buyer, restaurant, order, menu };
}

/* ------------------------------------------------------- role transitions */

export async function restaurantAction(token, orderId, action, body = {}) {
  const c = await api();
  return unwrap(
    await c.post(`/api/restaurant/orders/${orderId}/${action}`, { headers: auth(token), data: body }),
    `restaurant ${action}`,
  );
}

/** Drives an order to `target` using the owner's own endpoints. */
export async function advanceOrder(ownerToken, orderId, target) {
  const path = {
    CONFIRMED: ['accept'],
    PREPARING: ['accept', 'start-preparing'],
    READY_FOR_PICKUP: ['accept', 'start-preparing', 'ready'],
  }[target];
  if (!path) throw new Error(`advanceOrder cannot reach ${target}`);
  let last;
  for (const action of path) last = await restaurantAction(ownerToken, orderId, action);
  return last;
}

export async function ownerTokenFor(restaurantName) {
  const owner = { [SEED.restA]: SEED.ownerA, [SEED.restB]: SEED.ownerB }[restaurantName];
  if (!owner) throw new Error(`no seeded owner for ${restaurantName}`);
  return (await login(owner, SEED.userPassword)).token;
}

/* ------------------------------------------------------------- admin ops */

export async function createDriver(adminToken, overrides = {}) {
  const c = await api();
  const email = uniqueEmail('driver');
  const data = await unwrap(
    await c.post('/api/admin/drivers', {
      headers: auth(adminToken),
      data: {
        email, fullName: 'E2E Driver', phone: '01003234567',
        vehicleType: 'MOTORCYCLE', vehiclePlate: 'RUH E2E', ...overrides,
      },
    }),
    'create driver',
  );
  return { ...data, email, password: data.initialPassword };
}

export async function approveDriver(adminToken, userId) {
  const c = await api();
  return unwrap(
    await c.post(`/api/admin/drivers/${userId}/approve`, { headers: auth(adminToken) }),
    'approve driver',
  );
}

export async function approveRestaurant(adminToken, restaurantId) {
  const c = await api();
  return unwrap(
    await c.post(`/api/admin/restaurants/${restaurantId}/approve`, { headers: auth(adminToken) }),
    'approve restaurant',
  );
}

export async function adminRestaurants(adminToken, params = '') {
  const c = await api();
  return unwrap(await c.get(`/api/admin/restaurants${params}`, { headers: auth(adminToken) }), 'admin restaurants');
}

export async function setAvailability(driverToken, availability) {
  const c = await api();
  return unwrap(
    await c.patch('/api/driver/availability', { headers: auth(driverToken), data: { availability } }),
    'set availability',
  );
}

export async function driverOffers(driverToken) {
  const c = await api();
  return unwrap(await c.get('/api/driver/offers', { headers: auth(driverToken) }), 'driver offers');
}

export async function acceptOffer(driverToken, offerId) {
  const c = await api();
  return unwrap(
    await c.post(`/api/driver/offers/${offerId}/accept`, { headers: auth(driverToken) }),
    'accept offer',
  );
}

export async function driverAction(driverToken, orderId, action) {
  const c = await api();
  return unwrap(
    await c.post(`/api/driver/deliveries/${orderId}/${action}`, { headers: auth(driverToken) }),
    `driver ${action}`,
  );
}

export async function getOrder(token, orderId) {
  const c = await api();
  return unwrap(await c.get(`/api/orders/${orderId}`, { headers: auth(token) }), 'get order');
}

/** Raw call, for the cases that assert on a refusal rather than a success. */
export async function raw(method, path, { token, data } = {}) {
  const c = await api();
  const res = await c[method](path, {
    ...(token ? { headers: auth(token) } : {}),
    ...(data ? { data } : {}),
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

/**
 * Waits for a driver offer to appear.
 *
 * Dispatch is a background job, so an offer arrives a tick after the order is
 * ready rather than synchronously. The e2e backend runs it every 2 s.
 */
export async function waitForOffer(driverToken, { timeoutMs = 30_000, orderNumber } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const offers = await driverOffers(driverToken);
    // A driver can hold open offers for several orders at once, and earlier
    // scenarios leave their own orders waiting for collection. Taking
    // offers[0] would hand this test somebody else's order.
    const match = orderNumber
      ? offers.find((o) => o.order.orderNumber === orderNumber)
      : offers[0];
    if (match) return match;
    if (Date.now() > deadline) {
      throw new Error(
        `no driver offer${orderNumber ? ` for ${orderNumber}` : ''} arrived before the timeout`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Moves an order's clock backwards.
 *
 * Time-window rules (the 15-minute unassigned backlog, the 10-minute accept
 * timeout) cannot be reached by waiting inside a test, and lowering the
 * threshold would mean testing a different rule than the one configured.
 */
export async function backdateOrder(orderNumber, minutes = 20) {
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const backendDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '../../../backend',
  );
  execFileSync(
    process.execPath,
    ['--env-file=.env.e2e', 'scripts/e2e-backdate.js', orderNumber, String(minutes)],
    { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' },
  );
}

/**
 * Takes every driver offline.
 *
 * TC-400's first step is "ensure no driver is AVAILABLE". Earlier scenarios
 * leave their own drivers online, so this has to be established rather than
 * assumed — the suite is serial, so there is no live offer to disturb.
 */
export async function takeAllDriversOffline() {
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const backendDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '../../../backend',
  );
  execFileSync(process.execPath, ['--env-file=.env.e2e', 'scripts/e2e-quiesce.js'], {
    cwd: backendDir, stdio: 'pipe', encoding: 'utf8',
  });
}
