import { test, expect } from '@playwright/test';
import { SEED, PASSWORD, placeOrder, ownerTokenFor } from './helpers/api.js';
import { signIn, orderCard, confirmDialog } from './helpers/ui.js';

/**
 * TC-399 — A restaurant's rejection reaches the customer with its reason.  High.
 *
 * ADR-007: there is no separate REJECTED status. "Rejected by the restaurant"
 * is a presentation of CANCELLED derived from `cancelled_by`, so the customer
 * learns who cancelled and why without the state machine growing a state.
 */
test('TC-399: a rejection reads as "rejected by the restaurant", with the reason', async ({ browser }) => {
  const customerCtx = await browser.newContext();
  const restaurantCtx = await browser.newContext();
  const customer = await customerCtx.newPage();
  const restaurant = await restaurantCtx.newPage();

  /* 1. The customer places an order. */
  const { order, buyer } = await placeOrder({ restaurantName: SEED.restA });
  await signIn(customer, buyer.email, PASSWORD);
  await customer.goto(`/orders/${order.id}`);
  await expect(customer.getByText('Waiting for the restaurant').first()).toBeVisible();

  /* 2. The restaurant rejects it with a code and a note. */
  await signIn(restaurant, SEED.ownerA, SEED.userPassword);
  await restaurant.goto('/restaurant/orders');
  await orderCard(restaurant, order.orderNumber).getByRole('button', { name: 'Reject' }).click();
  await confirmDialog(restaurant, {
    reasonCode: 'OUT_OF_STOCK',
    reason: 'The lamb sold out ten minutes ago.',
    confirmLabel: /Reject/,
  });

  /* 3. The customer refreshes and is told who rejected it and why. */
  await customer.reload();
  await expect(customer.getByText('Cancelled').first()).toBeVisible({ timeout: 30_000 });
  await expect(customer.getByText('Rejected by the restaurant')).toBeVisible();
  await expect(customer.getByText('out of stock')).toBeVisible();
  await expect(customer.getByText('The lamb sold out ten minutes ago.')).toBeVisible();

  // The presentation is derived, not stored: the status itself is CANCELLED.
  const ownerToken = await ownerTokenFor(SEED.restA);
  expect(ownerToken).toBeTruthy();

  await Promise.all([customerCtx.close(), restaurantCtx.close()]);
});
