import { test, expect } from '@playwright/test';
import {
  SEED, loginAdmin, registerOwner, approveRestaurant, login, registerCustomer,
  addAddress, addToCart, checkout, menuOf, raw, restaurantAction, createDriver,
  approveDriver, waitForOffer, acceptOffer, driverAction, takeAllDriversOffline,
  PASSWORD,
} from './helpers/api.js';
import { signIn, confirmDialog } from './helpers/ui.js';

/**
 * TC-405 — Review moderation changes the public rating.  High.
 *
 * BR-V7: hiding a review recomputes the aggregate, it does not merely filter
 * the list. Three ratings of 5, 4 and 3 average 4.00; hiding the 3 must move
 * the published average to 4.50 and restoring it must move it back.
 *
 * Builds its own restaurant so the arithmetic is exact — a seeded one carries
 * ratings from earlier scenarios.
 */
test('TC-405: hiding a review recomputes the public average', async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const customerCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  const customerPage = await customerCtx.newPage();

  await takeAllDriversOffline();
  const admin = await loginAdmin();

  /* A restaurant with no rating history. */
  const name = `Moderation Kitchen ${Date.now().toString(36)}`;
  const owner = await registerOwner({ restaurantName: name });
  const category = await raw('post', '/api/restaurant/categories', {
    token: owner.token, data: { name: 'Mains' },
  });
  await raw('post', '/api/restaurant/items', {
    token: owner.token,
    data: { categoryId: category.body.data.id, name: 'Rated Dish', price: '50.00' },
  });
  await raw('put', '/api/restaurant/hours', {
    token: owner.token,
    data: {
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek, opensAt: '00:00', closesAt: '23:59', isClosed: false,
      })),
    },
  });
  await approveRestaurant(admin.token, owner.restaurant.id);
  const ownerSession = await login(owner.email, PASSWORD);

  const driver = await createDriver(admin.token);
  await approveDriver(admin.token, driver.user.id);
  const driverSession = await login(driver.email, driver.password);
  await raw('patch', '/api/driver/availability', {
    token: driverSession.token, data: { availability: 'AVAILABLE' },
  });

  const item = (await menuOf(owner.restaurant.id)).find((i) => i.isAvailable);

  /** Takes one order all the way to a review with the given rating. */
  async function reviewWith(rating, comment) {
    const buyer = await registerCustomer();
    const address = await addAddress(buyer.token);
    await addToCart(buyer.token, item.id, 1);
    const order = await checkout(buyer.token, address.id);

    await restaurantAction(ownerSession.token, order.id, 'accept');
    await restaurantAction(ownerSession.token, order.id, 'start-preparing');
    await restaurantAction(ownerSession.token, order.id, 'ready');

    const offer = await waitForOffer(driverSession.token, { orderNumber: order.orderNumber });
    await acceptOffer(driverSession.token, offer.id);
    await driverAction(driverSession.token, order.id, 'pick-up');
    await driverAction(driverSession.token, order.id, 'deliver');

    const created = await raw('post', '/api/reviews', {
      token: buyer.token,
      data: { orderId: order.id, restaurantRating: rating, comment },
    });
    expect(created.status).toBe(201);
    return { buyer, order };
  }

  /* 1. Three reviews: 5, 4 and 3 stars. Average 4.00. */
  await reviewWith(5, 'Outstanding, would order weekly.');
  await reviewWith(4, 'Very good, slightly slow.');
  const low = await reviewWith(3, 'Merely acceptable on this occasion.');

  const before = await raw('get', `/api/restaurants/${owner.restaurant.id}`);
  expect(before.body.data.ratingCount).toBe(3);
  expect(Number(before.body.data.ratingAverage)).toBeCloseTo(4.0, 2);

  await signIn(customerPage, low.buyer.email, PASSWORD);
  await customerPage.goto(`/restaurants/${owner.restaurant.id}`);
  await expect(customerPage.getByText('4.00 (3)')).toBeVisible();
  await expect(customerPage.getByText('Merely acceptable on this occasion.')).toBeVisible();

  /* 2. The admin hides the 3-star review. */
  await signIn(adminPage, SEED.adminEmail, SEED.adminPassword);
  await adminPage.goto('/admin/reviews');
  const row = adminPage.locator('li', { hasText: 'Merely acceptable on this occasion.' }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Hide' }).click();
  await confirmDialog(adminPage, {
    reason: 'Duplicate of an earlier complaint already handled',
    confirmLabel: /Hide/,
  });

  /* 3. The public average moves to 4.50 and the review is gone.
   *    Polled, because the dialog closes as the request is sent rather than
   *    when it returns. */
  await expect
    .poll(async () => {
      const r = await raw('get', `/api/restaurants/${owner.restaurant.id}`);
      return r.body.data.ratingCount;
    }, { timeout: 20_000 })
    .toBe(2);

  const hidden = await raw('get', `/api/restaurants/${owner.restaurant.id}`);
  expect(Number(hidden.body.data.ratingAverage)).toBeCloseTo(4.5, 2);

  await customerPage.reload();
  await expect(customerPage.getByText('4.50 (2)')).toBeVisible();
  await expect(customerPage.getByText('Merely acceptable on this occasion.')).toHaveCount(0);

  /* 4. The admin restores it. */
  await adminPage.goto('/admin/reviews');
  await adminPage.locator('li', { hasText: 'Merely acceptable on this occasion.' }).first()
    .getByRole('button', { name: 'Restore' }).click();

  /* 5. The average returns to 4.00 with the review visible again. */
  await expect
    .poll(async () => {
      const r = await raw('get', `/api/restaurants/${owner.restaurant.id}`);
      return r.body.data.ratingCount;
    }, { timeout: 20_000 })
    .toBe(3);

  const restored = await raw('get', `/api/restaurants/${owner.restaurant.id}`);
  expect(Number(restored.body.data.ratingAverage)).toBeCloseTo(4.0, 2);

  await customerPage.reload();
  await expect(customerPage.getByText('4.00 (3)')).toBeVisible();
  await expect(customerPage.getByText('Merely acceptable on this occasion.')).toBeVisible();

  await Promise.all([adminCtx.close(), customerCtx.close()]);
});
