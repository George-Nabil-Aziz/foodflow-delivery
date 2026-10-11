import { test, expect } from '@playwright/test';
import {
  SEED, loginAdmin, createDriver, approveDriver, login, placeOrder,
  ownerTokenFor, advanceOrder, waitForOffer, acceptOffer, raw,
  takeAllDriversOffline, driverOffers,
} from './helpers/api.js';
import { signIn } from './helpers/ui.js';

/**
 * TC-403 — One driver cannot hold two deliveries.  High.
 *
 * BR-D5 and BR-D9. The single-delivery rule is enforced by the partial unique
 * index `uq_assignments_driver_active`, and going offline mid-delivery is
 * refused with an explanation rather than silently ignored.
 */
test('TC-403: a driver on a delivery gets no new offers and cannot go offline', async ({ page }) => {
  await takeAllDriversOffline();

  const admin = await loginAdmin();
  const created = await createDriver(admin.token);
  await approveDriver(admin.token, created.user.id);
  const driverSession = await login(created.email, created.password);

  const ownerToken = await ownerTokenFor(SEED.restA);

  /* 1. The driver accepts a delivery. */
  const first = await placeOrder({ restaurantName: SEED.restA });
  await advanceOrder(ownerToken, first.order.id, 'READY_FOR_PICKUP');

  await raw('patch', '/api/driver/availability', {
    token: driverSession.token, data: { availability: 'AVAILABLE' },
  });
  const offer = await waitForOffer(driverSession.token, { orderNumber: first.order.orderNumber });
  await acceptOffer(driverSession.token, offer.id);

  /* 2. A second order becomes ready; no offer reaches this driver. */
  const second = await placeOrder({ restaurantName: SEED.restA });
  await advanceOrder(ownerToken, second.order.id, 'READY_FOR_PICKUP');

  // Give dispatch several cycles to decide, then confirm it decided against.
  await page.waitForTimeout(6_000);
  const offers = await driverOffers(driverSession.token);
  expect(offers.some((o) => o.order.orderNumber === second.order.orderNumber)).toBe(false);

  await signIn(page, created.email, created.password);
  await page.goto('/driver/offers');
  await expect(page.getByText(second.order.orderNumber)).toHaveCount(0);

  /* 3. Going offline is refused, and the refusal names the active order. */
  await page.goto('/driver');
  await expect(page.getByText('On a delivery')).toBeVisible();
  await expect(page.getByText('You cannot go offline while a delivery is in progress.')).toBeVisible();

  const offlineButton = page.getByRole('button', { name: /You cannot go offline during an active delivery/ });
  await expect(offlineButton).toBeDisabled();

  // And the server refuses it too, not just the disabled button.
  const refused = await raw('patch', '/api/driver/availability', {
    token: driverSession.token, data: { availability: 'OFFLINE' },
  });
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(refused.body)).toMatch(/deliver/i);

  // The database-level guarantee behind all of it.
  const assignments = await raw('get', '/api/driver/deliveries', { token: driverSession.token });
  const active = assignments.body.data.filter((d) => d.status === 'OUT_FOR_DELIVERY' || d.status === 'READY_FOR_PICKUP');
  expect(active).toHaveLength(1);
});
