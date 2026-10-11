import { test, expect } from '@playwright/test';
import {
  SEED, PASSWORD, loginAdmin, registerCustomer, registerOwner, placeOrder,
  ownerTokenFor, advanceOrder, raw, addAddress, addToCart, checkout,
  findRestaurant, menuOf, driverAction, createDriver, approveDriver, login,
  waitForOffer, acceptOffer, takeAllDriversOffline,
} from './helpers/api.js';
import { signIn, confirmDialog } from './helpers/ui.js';

/**
 * TC-396 — Admin journey: dashboard through intervention.  High.
 *
 * Two claims run through every step: a destructive action cannot be confirmed
 * without a reason, and every one of them lands in the audit log attributed to
 * the admin who did it.
 */
test('TC-396: an admin works the dashboard, the queues and the audit log', async ({ page }) => {
  // Dispatch is global: a driver left online by an earlier scenario would
  // claim the offer this one waits for.
  await takeAllDriversOffline();

  const admin = await loginAdmin();

  /* Arrange the things the admin will act on. */
  const victim = await registerCustomer({ fullName: 'Suspendable Customer' });
  const pendingOwner = await registerOwner({ restaurantName: `Approve Me ${Date.now().toString(36)}` });
  const rejectOwner = await registerOwner({ restaurantName: `Reject Me ${Date.now().toString(36)}` });

  // BR-AD10: approval needs an available item, so give the approvable one a menu.
  const cat = await raw('post', '/api/restaurant/categories', {
    token: pendingOwner.token, data: { name: 'Mains' },
  });
  await raw('post', '/api/restaurant/items', {
    token: pendingOwner.token,
    data: { categoryId: cat.body.data.id, name: 'Approvable Dish', price: '40.00' },
  });

  const { order } = await placeOrder({ restaurantName: SEED.restA });
  const ownerToken = await ownerTokenFor(SEED.restA);
  await advanceOrder(ownerToken, order.id, 'PREPARING');

  /* A delivered, reviewed order gives the moderation queue something real. */
  const reviewer = await registerCustomer();
  const address = await addAddress(reviewer.token);
  const restA = await findRestaurant(SEED.restA);
  const item = (await menuOf(restA.id)).find((i) => i.isAvailable);
  await addToCart(reviewer.token, item.id, 1);
  const reviewed = await checkout(reviewer.token, address.id);
  await advanceOrder(ownerToken, reviewed.id, 'READY_FOR_PICKUP');

  const driver = await createDriver(admin.token);
  await approveDriver(admin.token, driver.user.id);
  const driverSession = await login(driver.email, driver.password);
  await raw('patch', '/api/driver/availability', {
    token: driverSession.token, data: { availability: 'AVAILABLE' },
  });
  const offer = await waitForOffer(driverSession.token, { orderNumber: reviewed.orderNumber });
  await acceptOffer(driverSession.token, offer.id);
  await driverAction(driverSession.token, reviewed.id, 'pick-up');
  await driverAction(driverSession.token, reviewed.id, 'deliver');
  await raw('post', '/api/reviews', {
    token: reviewer.token,
    data: { orderId: reviewed.id, restaurantRating: 1, comment: 'Abusive placeholder comment.' },
  });

  await signIn(page, SEED.adminEmail, SEED.adminPassword);

  /* 1. The dashboard shows its tiles and an alert strip. */
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Platform dashboard' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Needs attention' })).toBeVisible();

  /* 2. Filter and search the user list, then suspend with a reason. */
  await page.goto('/admin/users');
  await page.getByLabel('Role').selectOption('CUSTOMER');
  await page.getByLabel('Search').fill(victim.user.email);
  const victimRow = page.locator('tr', { hasText: victim.user.email });
  await expect(victimRow).toBeVisible();

  await victimRow.getByRole('button', { name: 'Suspend' }).click();
  const suspendDialog = page.getByRole('dialog');
  // The confirm button stays disabled until a reason is given.
  await expect(suspendDialog.getByRole('button', { name: /Suspend/ })).toBeDisabled();
  await confirmDialog(page, { reason: 'Repeated fraudulent chargebacks', confirmLabel: /Suspend/ });
  await expect(victimRow.getByText('SUSPENDED')).toBeVisible({ timeout: 20_000 });

  /* 3. Approve one restaurant and reject another, with a reason. */
  await page.goto('/admin/restaurants');
  const approveRow = page.locator('li', { hasText: pendingOwner.restaurant.name }).first();
  await approveRow.getByRole('button', { name: 'Approve' }).click();

  const rejectRow = page.locator('li', { hasText: rejectOwner.restaurant.name }).first();
  await rejectRow.getByRole('button', { name: 'Reject' }).click();
  await confirmDialog(page, {
    reason: 'Address could not be verified against the registry',
    confirmLabel: 'Reject application',
  });

  /* 4. Filter the order list and force-cancel, reason mandatory. */
  await page.goto('/admin/orders');
  await page.getByLabel('Filter by status').selectOption('PREPARING');
  const orderRow = page.locator('tr', { hasText: order.orderNumber });
  await expect(orderRow).toBeVisible();

  await orderRow.getByRole('button', { name: 'Force-cancel' }).click();
  const cancelDialog = page.getByRole('dialog');
  await expect(cancelDialog.getByRole('button', { name: /Cancel this order|Force-cancel|Confirm/ }).last())
    .toBeDisabled();
  await confirmDialog(page, {
    reasonCode: 'ADMIN_INTERVENTION',
    reason: 'Customer reported the restaurant is closed',
    confirmLabel: /Cancel this order|Force-cancel|Confirm/,
  });

  const cancelled = await raw('get', `/api/admin/orders/${order.id}`, { token: admin.token });
  expect(cancelled.body.data.status).toBe('CANCELLED');

  /* 5. Hide an abusive review, then restore it. */
  await page.goto('/admin/reviews');
  const reviewRow = page.locator('li', { hasText: 'Abusive placeholder comment.' }).first();
  await expect(reviewRow).toBeVisible();
  await reviewRow.getByRole('button', { name: 'Hide' }).click();
  await confirmDialog(page, { reason: 'Abusive language toward staff', confirmLabel: /Hide/ });

  await expect(page.locator('li', { hasText: 'Hidden because:' }).first()).toBeVisible({ timeout: 20_000 });
  await page.locator('li', { hasText: 'Abusive placeholder comment.' }).first()
    .getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('li', { hasText: 'Hidden because:' })).toHaveCount(0, { timeout: 20_000 });

  /* 6. Every action from steps 2-5 is in the audit log, attributed. */
  const audit = await raw('get', '/api/admin/audit-logs?limit=100', { token: admin.token });
  const actions = audit.body.data.map((row) => row.action);
  for (const action of [
    'USER_SUSPENDED', 'RESTAURANT_APPROVED', 'RESTAURANT_REJECTED',
    'ORDER_FORCE_CANCELLED', 'REVIEW_HIDDEN', 'REVIEW_RESTORED',
  ]) {
    expect(actions, `audit log is missing ${action}`).toContain(action);
  }
  for (const row of audit.body.data) expect(row.admin?.id ?? row.adminUserId).toBeTruthy();
});
