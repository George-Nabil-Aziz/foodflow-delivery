import { test, expect } from '@playwright/test';
import {
  SEED, PASSWORD, placeOrder, ownerTokenFor, advanceOrder, loginAdmin,
  createDriver, approveDriver, login, waitForOffer, acceptOffer, driverAction, raw,
  backdateOrder, takeAllDriversOffline,
} from './helpers/api.js';
import { signIn } from './helpers/ui.js';

/**
 * TC-400 — No driver available leaves the order intact.  Critical.
 *
 * FR-7.4. The failure mode being guarded against is an order quietly cancelling
 * itself because dispatch found nobody. It must wait, say so, and appear in the
 * admin backlog until a driver exists.
 */
test('TC-400: an order with no available driver waits rather than cancelling', async ({ browser }) => {
  const customerCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const customer = await customerCtx.newPage();
  const adminPage = await adminCtx.newPage();

  /* 1. No driver is AVAILABLE — the global setup takes the seeded ones
   *    offline, and this scenario creates none until step 6. */
  await takeAllDriversOffline();

  const admin = await loginAdmin();
  const drivers = await raw('get', '/api/admin/drivers?availability=AVAILABLE', { token: admin.token });
  expect(drivers.body.data).toHaveLength(0);

  /* 2. Place an order and drive it to READY_FOR_PICKUP. */
  const { order, buyer } = await placeOrder({ restaurantName: SEED.restA });
  const ownerToken = await ownerTokenFor(SEED.restA);
  await advanceOrder(ownerToken, order.id, 'READY_FOR_PICKUP');

  /* 3. The customer is told a driver is being found, not that anything failed. */
  await signIn(customer, buyer.email, PASSWORD);
  await customer.goto(`/orders/${order.id}`);
  await expect(customer.getByText('Ready for pickup').first()).toBeVisible();
  await expect(customer.getByText('Finding a driver for your order.')).toBeVisible();

  /* 4. Advance the clock past the 15-minute escalation window, having
   *    given dispatch several cycles to fail to find anyone. */
  await customer.waitForTimeout(6_000);
  await backdateOrder(order.orderNumber, 20);

  const stillWaiting = await raw('get', `/api/orders/${order.id}`, { token: buyer.token });
  expect(stillWaiting.body.data.status).toBe('READY_FOR_PICKUP');
  expect(stillWaiting.body.data.status).not.toBe('CANCELLED');

  /* 5. The order is in the admin's unassigned backlog. */
  await signIn(adminPage, SEED.adminEmail, SEED.adminPassword);
  await adminPage.goto('/admin/orders?view=unassigned');
  const backlog = await raw('get', '/api/admin/orders/unassigned', { token: admin.token });
  expect(backlog.body.data.some((o) => o.orderNumber === order.orderNumber)).toBe(true);

  /* 6. A driver comes online and the order completes normally. */
  const created = await createDriver(admin.token);
  await approveDriver(admin.token, created.user.id);
  const driverSession = await login(created.email, created.password);
  await raw('patch', '/api/driver/availability', {
    token: driverSession.token,
    data: { availability: 'AVAILABLE' },
  });

  const offer = await waitForOffer(driverSession.token, { orderNumber: order.orderNumber });
  expect(offer.order.orderNumber).toBe(order.orderNumber);

  await acceptOffer(driverSession.token, offer.id);
  await driverAction(driverSession.token, order.id, 'pick-up');
  await driverAction(driverSession.token, order.id, 'deliver');

  await customer.reload();
  await expect(customer.getByText('Delivered').first()).toBeVisible({ timeout: 45_000 });

  await Promise.all([customerCtx.close(), adminCtx.close()]);
});
