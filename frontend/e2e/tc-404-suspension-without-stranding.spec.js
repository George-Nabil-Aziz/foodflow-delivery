import { test, expect } from '@playwright/test';
import {
  SEED, PASSWORD, registerOwner, loginAdmin, approveRestaurant, login,
  registerCustomer, addAddress, addToCart, checkout, menuOf, raw,
  restaurantAction, adminRestaurants,
} from './helpers/api.js';
import { signIn, confirmDialog } from './helpers/ui.js';

/**
 * TC-404 — Admin suspension removes a restaurant without stranding orders.  High.
 *
 * BR-R9 / BR-AD3. Suspension stops new trade immediately but must not cancel
 * food that is already being cooked — the customer is owed the order they
 * already placed.
 *
 * Uses its own restaurant rather than a seeded one, because suspending REST_A
 * would change the world every later scenario runs in.
 */
test('TC-404: suspension hides a restaurant but lets in-flight orders finish', async ({ browser }) => {
  const customerCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const customer = await customerCtx.newPage();
  const adminPage = await adminCtx.newPage();

  /* A restaurant of our own, approved and trading. */
  const name = `Suspendable Kitchen ${Date.now().toString(36)}`;
  const owner = await registerOwner({ restaurantName: name });
  const category = await raw('post', '/api/restaurant/categories', {
    token: owner.token, data: { name: 'Mains' },
  });
  await raw('post', '/api/restaurant/items', {
    token: owner.token,
    data: { categoryId: category.body.data.id, name: 'Suspendable Dish', price: '52.00' },
  });
  await raw('put', '/api/restaurant/hours', {
    token: owner.token,
    data: {
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek, opensAt: '00:00', closesAt: '23:59', isClosed: false,
      })),
    },
  });

  const admin = await loginAdmin();
  await approveRestaurant(admin.token, owner.restaurant.id);
  const ownerSession = await login(owner.email, PASSWORD);

  /* 1. A customer has an order in PREPARING. */
  const buyer = await registerCustomer();
  const address = await addAddress(buyer.token);
  const item = (await menuOf(owner.restaurant.id)).find((i) => i.isAvailable);
  await addToCart(buyer.token, item.id, 1);
  const order = await checkout(buyer.token, address.id);

  await restaurantAction(ownerSession.token, order.id, 'accept');
  await restaurantAction(ownerSession.token, order.id, 'start-preparing');

  /* 2. The admin suspends the restaurant, with a reason. */
  await signIn(adminPage, SEED.adminEmail, SEED.adminPassword);
  await adminPage.goto('/admin/restaurants');
  const row = adminPage.locator('tr', { hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Suspend' }).click();
  await confirmDialog(adminPage, {
    reason: 'Health inspection pending review',
    confirmLabel: 'Suspend restaurant',
  });

  const suspended = (await adminRestaurants(admin.token, `?q=${encodeURIComponent(name)}`))
    .find((r) => r.name === name);
  expect(suspended.status).toBe('SUSPENDED');

  /* 3. It disappears from the customer's listing. */
  await signIn(customer, buyer.email, PASSWORD);
  await customer.goto(`/restaurants?q=${encodeURIComponent(name)}`);
  await expect(customer.getByRole('link', { name: new RegExp(name, 'i') })).toHaveCount(0);

  /* 4. The in-flight order still completes. */
  const stillPreparing = await raw('get', `/api/orders/${order.id}`, { token: buyer.token });
  expect(stillPreparing.body.data.status).toBe('PREPARING');

  const ready = await restaurantAction(ownerSession.token, order.id, 'ready');
  expect(ready.status).toBe('READY_FOR_PICKUP');

  await customer.goto(`/orders/${order.id}`);
  await expect(customer.getByText('Ready for pickup').first()).toBeVisible();

  /* 5. A new order from the same restaurant is refused. */
  const refused = await raw('post', '/api/cart/items', {
    token: buyer.token, data: { foodItemId: item.id, quantity: 1 },
  });
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(['RESTAURANT_UNAVAILABLE', 'ITEM_UNAVAILABLE', 'RESOURCE_NOT_FOUND'])
    .toContain(refused.body.error.code);

  await Promise.all([customerCtx.close(), adminCtx.close()]);
});
