import { test, expect } from '@playwright/test';
import {
  SEED, PASSWORD, registerCustomer, findRestaurant, menuOf,
} from './helpers/api.js';
import {
  signIn, openRestaurant, addItemToCart, expectCartCount,
} from './helpers/ui.js';

/**
 * TC-397 — Cart restaurant switch, confirmed.  Critical.
 *
 * BR-C3/BR-C4: one restaurant per cart. The dialog must name both restaurants
 * and the item count, and confirming must replace the cart wholesale rather
 * than merging.
 */
test('TC-397: starting a new cart replaces the old one entirely', async ({ page }) => {
  const customer = await registerCustomer();
  await signIn(page, customer.email, PASSWORD);

  const restA = await findRestaurant(SEED.restA);
  const restB = await findRestaurant(SEED.restB);
  const itemsA = (await menuOf(restA.id)).filter((i) => i.isAvailable).slice(0, 3);
  const itemB = (await menuOf(restB.id)).find((i) => i.isAvailable);

  /* 1. A three-item cart at REST_A. */
  await openRestaurant(page, SEED.restA);
  for (const [index, item] of itemsA.entries()) {
    await addItemToCart(page, item.name);
    await expectCartCount(page, index + 1);
  }

  /* 2. Adding from REST_B raises the dialog, naming both and the count. */
  await openRestaurant(page, SEED.restB);
  await addItemToCart(page, itemB.name);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(SEED.restA);
  await expect(dialog).toContainText(SEED.restB);
  await expect(dialog).toContainText('3');

  /* 3. Confirm the destructive option. */
  await dialog.getByRole('button', { name: 'Start new cart' }).click();
  await expect(dialog).toBeHidden();

  /* 4. Exactly the one REST_B item survives. */
  await expectCartCount(page, 1);
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: SEED.restB })).toBeVisible();
  await expect(page.getByRole('heading', { name: itemB.name })).toBeVisible();

  for (const item of itemsA) {
    await expect(page.getByRole('heading', { name: item.name })).toHaveCount(0);
  }
  await expect(page.locator('ul > li').filter({ has: page.getByRole('button', { name: 'Remove' }) }))
    .toHaveCount(1);
});
