import { test, expect } from '@playwright/test';
import {
  SEED, PASSWORD, placeOrder, ownerTokenFor, advanceOrder, raw,
} from './helpers/api.js';
import { signIn } from './helpers/ui.js';

/**
 * TC-398 — The customer's cancellation window closes at preparation.  Critical.
 *
 * T2 and T4 are open to the customer; T6 is not. The UI must not merely hide
 * the control — the API has to refuse it too, or the rule is cosmetic.
 */
test('TC-398: a customer can cancel while PENDING and CONFIRMED, but not once PREPARING', async ({ page }) => {
  const ownerToken = await ownerTokenFor(SEED.restA);

  /* 1. PENDING: cancel succeeds. */
  const first = await placeOrder({ restaurantName: SEED.restA });
  await signIn(page, first.buyer.email, PASSWORD);
  await page.goto(`/orders/${first.order.id}`);

  await expect(page.getByText('Waiting for the restaurant').first()).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByText('Cancelled').first()).toBeVisible({ timeout: 20_000 });

  /* 2. CONFIRMED: still within the window. */
  const second = await placeOrder({ restaurantName: SEED.restA, customer: first.buyer });
  await advanceOrder(ownerToken, second.order.id, 'CONFIRMED');

  await page.goto(`/orders/${second.order.id}`);
  await expect(page.getByText('Confirmed').first()).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByText('Cancelled').first()).toBeVisible({ timeout: 20_000 });

  /* 3. PREPARING: the control is gone and the API refuses. */
  const third = await placeOrder({ restaurantName: SEED.restA, customer: first.buyer });
  await advanceOrder(ownerToken, third.order.id, 'PREPARING');

  await page.goto(`/orders/${third.order.id}`);
  await expect(page.getByText('Being prepared').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  // The absence is explained rather than left as a missing button.
  await expect(page.getByText(/can no longer be cancelled/i)).toBeVisible();

  const refused = await raw('post', `/api/orders/${third.order.id}/cancel`, {
    token: first.buyer.token,
    data: { reason: 'CUSTOMER_CHANGED_MIND' },
  });
  expect(refused.status).toBe(409);
  expect(refused.body.error.code).toBe('INVALID_ORDER_TRANSITION');
  expect(refused.body.error.message).toBeTruthy();
});
