import { test, expect } from '@playwright/test';
import {
  SEED, PASSWORD, registerCustomer, addAddress, findRestaurant, menuOf,
  addToCart, checkout, ownerTokenFor, raw,
} from './helpers/api.js';
import { signIn, summaryValue } from './helpers/ui.js';

/**
 * TC-401 — A menu price change does not alter a placed order.  Critical.
 *
 * BR-O1 and goal G2. `order_items` is a snapshot: the name and unit price are
 * copied at checkout, so no later menu edit can rewrite what a customer was
 * charged or what they believe they bought.
 */
test('TC-401: editing the menu does not rewrite a placed order', async ({ page }) => {
  const buyer = await registerCustomer();
  const address = await addAddress(buyer.token);

  const restA = await findRestaurant(SEED.restA);
  const item = (await menuOf(restA.id)).find((i) => i.isAvailable && i.price === '385.00');
  expect(item, 'the seed provides a 385.00 item at REST_A').toBeTruthy();
  const originalName = item.name;

  /* 1. Order it at 385.00 and record the totals the customer agreed to. */
  await addToCart(buyer.token, item.id, 1);
  const order = await checkout(buyer.token, address.id);

  await signIn(page, buyer.email, PASSWORD);
  await page.goto(`/orders/${order.id}`);
  const placedTotal = await summaryValue(page, 'Total');
  await expect(page.getByText(originalName).first()).toBeVisible();
  await expect(page.getByText('EGP 385.00').first()).toBeVisible();

  /* 2. The restaurant raises the price and renames the dish. */
  const ownerToken = await ownerTokenFor(SEED.restA);
  const renamed = `${originalName} Deluxe`;
  const edit = await raw('patch', `/api/restaurant/items/${item.id}`, {
    token: ownerToken,
    data: { price: '450.00', name: renamed },
  });
  expect(edit.status).toBe(200);

  // The live menu really did change, so the next assertion means something.
  const liveItem = (await menuOf(restA.id)).find((i) => i.id === item.id);
  expect(liveItem.price).toBe('450.00');
  expect(liveItem.name).toBe(renamed);

  /* 3. The placed order is untouched. */
  await page.reload();
  await expect(page.getByText(originalName, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(renamed)).toHaveCount(0);
  expect(await summaryValue(page, 'Total')).toBe(placedTotal);

  const stored = await raw('get', `/api/orders/${order.id}`, { token: buyer.token });
  expect(stored.body.data.items[0].name).toBe(originalName);
  expect(stored.body.data.items[0].unitPrice).toBe('385.00');
  expect(stored.body.data.totalAmount).toBe(order.totalAmount);

  /* Leave the seed as we found it: later scenarios read this price. */
  await raw('patch', `/api/restaurant/items/${item.id}`, {
    token: ownerToken,
    data: { price: '385.00', name: originalName },
  });
});
