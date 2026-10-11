import { test, expect } from '@playwright/test';
import {
  SEED, loginAdmin, createDriver, approveDriver, placeOrder, ownerTokenFor,
  advanceOrder, login, waitForOffer, raw, takeAllDriversOffline,
} from './helpers/api.js';
import { signIn } from './helpers/ui.js';

/**
 * TC-395 — Driver journey: provisioning through delivery.  Critical.
 *
 * Two claims: a driver cannot act before an admin approves them, and PII is
 * disclosed progressively — a district before accepting, the street address
 * only after.
 */
test('TC-395: driver provisioning through delivery', async ({ browser }) => {
  const driverCtx = await browser.newContext();
  const driver = await driverCtx.newPage();

  // Dispatch is global: a driver left online by an earlier scenario would
  // claim the offer this one waits for.
  await takeAllDriversOffline();

  /* 1. Admin creates the account; the password is shown exactly once. */
  const admin = await loginAdmin();
  const created = await createDriver(admin.token);
  expect(created.initialPassword).toBeTruthy();

  /* 2. The driver signs in and is told they are waiting, with no offers. */
  await signIn(driver, created.email, created.password);
  await driver.goto('/driver');
  await expect(driver.getByText(/Account pending approval/i)).toBeVisible();
  await expect(driver.getByRole('button', { name: /Go online/ })).toHaveCount(0);

  const driverSession = await login(created.email, created.password);
  const blocked = await raw('get', '/api/driver/offers', { token: driverSession.token });
  expect(blocked.status).toBe(403);

  /* 3. Admin approves. */
  await approveDriver(admin.token, created.user.id);

  /* An order is waiting to be collected. */
  const { order, buyer } = await placeOrder({ restaurantName: SEED.restA });
  const ownerToken = await ownerTokenFor(SEED.restA);
  await advanceOrder(ownerToken, order.id, 'READY_FOR_PICKUP');

  /* 4. Going online produces an offer that names a district, not an address. */
  await driver.goto('/driver');
  await driver.getByRole('button', { name: 'Go online' }).click();
  await expect(driver.getByText('Online and available')).toBeVisible();

  const freshSession = await login(created.email, created.password);
  const offer = await waitForOffer(freshSession.token, { orderNumber: order.orderNumber });

  await driver.goto('/driver/offers');
  const offerCard = driver.locator('li', { hasText: order.orderNumber }).first();
  await expect(offerCard).toBeVisible({ timeout: 30_000 });

  const offerText = await offerCard.innerText();
  expect(offerText).toContain('Zamalek');
  // Progressive disclosure: the street, the customer and their phone are not
  // needed to decide whether to take the job, so they are not sent.
  expect(offerText).not.toContain('12 Shagaret El Dor Street');
  expect(offerText).not.toContain(buyer.email);

  const offersPayload = JSON.stringify(await raw('get', '/api/driver/offers', { token: freshSession.token }));
  expect(offersPayload).not.toContain('12 Shagaret El Dor Street');
  expect(offersPayload).not.toContain(buyer.email);

  /* 5. Accepting reveals the full address and the customer's first name. */
  await offerCard.getByRole('button', { name: 'Accept' }).click();
  await driver.waitForURL(/\/driver\/deliveries\//, { timeout: 30_000 });

  await expect(driver.getByText('12 Shagaret El Dor Street')).toBeVisible();
  await expect(driver.getByRole('heading', { name: 'Deliver to' })).toBeVisible();

  const accepted = await raw('get', `/api/driver/deliveries/${order.id}`, { token: freshSession.token });
  expect(accepted.body.data.dropoff.line1).toBe('12 Shagaret El Dor Street');
  expect(accepted.body.data.dropoff.customerFirstName).toBeTruthy();
  // A first name and a phone, never the full identity.
  expect(JSON.stringify(accepted.body.data)).not.toContain(buyer.email);

  /* 6. Pick up, then deliver. */
  await driver.getByRole('button', { name: 'I have picked up the order' }).click();
  await expect(driver.getByRole('button', { name: 'Mark as delivered' })).toBeVisible();
  await driver.getByRole('button', { name: 'Mark as delivered' }).click();
  await expect(driver.getByText('Delivered').first()).toBeVisible();

  /* 7. Availability returns and the delivery is in history. */
  await driver.goto('/driver');
  await expect(driver.getByText('Online and available')).toBeVisible({ timeout: 20_000 });

  await driver.goto('/driver/history');
  await expect(driver.getByText(order.orderNumber).first()).toBeVisible();

  expect(offer.order.orderNumber).toBe(order.orderNumber);
  await driverCtx.close();
});
