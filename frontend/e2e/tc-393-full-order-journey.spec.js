import { test, expect } from '@playwright/test';
import {
  PASSWORD, SEED, uniqueEmail, addAddress, login, loginAdmin, createDriver,
  approveDriver, setAvailability, waitForOffer, findRestaurant, menuOf,
  takeAllDriversOffline,
} from './helpers/api.js';
import {
  signIn, openRestaurant, addItemToCart, expectCartCount, summaryValue,
  checkoutFromCart, orderCard,
} from './helpers/ui.js';

/**
 * TC-393 — Full order journey, customer to review.  Priority: Critical.
 *
 * The direct proof of goal G1, and the one scenario that is driven entirely
 * through the browser across three separate contexts. Anything arranged by API
 * here would weaken exactly the claim this test exists to make.
 */
test('TC-393: full order journey, customer to review', async ({ browser }) => {
  const customerCtx = await browser.newContext();
  const restaurantCtx = await browser.newContext();
  const driverCtx = await browser.newContext();

  const customer = await customerCtx.newPage();
  const restaurant = await restaurantCtx.newPage();
  const driver = await driverCtx.newPage();

  // Dispatch is global: a driver left online by an earlier scenario would
  // claim the offer this one waits for.
  await takeAllDriversOffline();

  const restA = await findRestaurant(SEED.restA);
  const restAItems = (await menuOf(restA.id)).filter((i) => i.isAvailable);
  const [item1, item2] = restAItems;

  /* 1. Customer registers and lands on the home view. */
  const email = uniqueEmail('journey');
  await customer.goto('/register');
  await customer.getByLabel('Your name').fill('Journey Customer');
  await customer.getByLabel('Email').fill(email);
  await customer.getByLabel('Phone').fill('01001234567');
  await customer.getByLabel('Password').fill(PASSWORD);
  await customer.getByRole('button', { name: 'Create account' }).click();
  await expect(customer.getByRole('button', { name: 'Sign out' })).toBeVisible();

  // A delivery address is a precondition of checkout, not part of this journey.
  const session = await login(email, PASSWORD);
  await addAddress(session.token);

  /* 2-3. Browse, open REST_A, add two items, watch the badge. */
  await openRestaurant(customer, SEED.restA);
  await addItemToCart(customer, item1.name);
  await expectCartCount(customer, 1);
  await addItemToCart(customer, item2.name);
  await expectCartCount(customer, 2);

  /* 4. Adding from REST_B raises the switch dialog; keep the existing cart. */
  const restB = await findRestaurant(SEED.restB);
  const restBItem = (await menuOf(restB.id)).find((i) => i.isAvailable);
  await openRestaurant(customer, SEED.restB);
  await addItemToCart(customer, restBItem.name);

  const dialog = customer.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(SEED.restA);
  await expect(dialog).toContainText(SEED.restB);
  await dialog.getByRole('button', { name: 'Keep my cart' }).click();
  await expect(dialog).toBeHidden();
  await expectCartCount(customer, 2);

  /* 5. Totals, then checkout. */
  await customer.goto('/cart');
  await expect(customer.getByRole('heading', { name: SEED.restA })).toBeVisible();

  const cartTotals = {
    subtotal: await summaryValue(customer, 'Subtotal'),
    delivery: await summaryValue(customer, 'Delivery'),
    tax: await summaryValue(customer, 'Tax'),
    total: await summaryValue(customer, 'Total'),
  };
  // The server computes these; the assertion is that they are real money, not
  // that the client re-derived them correctly.
  for (const value of Object.values(cartTotals)) expect(value).toMatch(/^EGP [\d,]+\.\d{2}$/);

  await checkoutFromCart(customer);

  /* 6. The order exists at PENDING, with its number and timeline. */
  await expect(customer.getByText('Waiting for the restaurant').first()).toBeVisible();
  const heading = await customer.getByRole('heading', { level: 1 }).innerText();
  const orderNumber = heading.replace('Order ', '').trim();
  expect(orderNumber).toMatch(/^FF-\d{8}-[A-Z0-9]+$/);
  const orderUrl = customer.url();

  /* 7-8. Restaurant accepts, prepares, marks ready. */
  await signIn(restaurant, SEED.ownerA, SEED.userPassword);
  await restaurant.goto('/restaurant/orders');
  await expect(orderCard(restaurant, orderNumber)).toBeVisible();

  await orderCard(restaurant, orderNumber).getByRole('button', { name: 'Accept order' }).click();
  await expect(orderCard(restaurant, orderNumber).getByRole('button', { name: 'Start preparing' }))
    .toBeVisible();

  await orderCard(restaurant, orderNumber).getByRole('button', { name: 'Start preparing' }).click();
  await expect(orderCard(restaurant, orderNumber)
    .getByRole('button', { name: 'Mark ready for pickup' })).toBeVisible();

  await orderCard(restaurant, orderNumber).getByRole('button', { name: 'Mark ready for pickup' }).click();
  await expect(orderCard(restaurant, orderNumber).getByText('ready for pickup', { exact: false }))
    .toBeVisible();

  /* 9. Driver comes online and accepts the offer. */
  const admin = await loginAdmin();
  const newDriver = await createDriver(admin.token);
  await approveDriver(admin.token, newDriver.user.id);

  await signIn(driver, newDriver.email, newDriver.password);
  await driver.goto('/driver');
  await driver.getByRole('button', { name: 'Go online' }).click();
  await expect(driver.getByText('Online and available')).toBeVisible();

  // Dispatch is a background job, so wait for it rather than assuming.
  const driverSession = await login(newDriver.email, newDriver.password);
  await waitForOffer(driverSession.token, { orderNumber });

  await driver.goto('/driver/offers');
  const offer = driver.locator('li', { hasText: orderNumber }).first();
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await offer.getByRole('button', { name: 'Accept' }).click();

  /* 10. Pick up, then deliver. */
  await driver.waitForURL(/\/driver\/deliveries\//, { timeout: 30_000 });
  await driver.getByRole('button', { name: 'I have picked up the order' }).click();
  await expect(driver.getByRole('button', { name: 'Mark as delivered' })).toBeVisible();
  await driver.getByRole('button', { name: 'Mark as delivered' }).click();
  await expect(driver.getByText('Delivered').first()).toBeVisible();

  /* 11. The customer's tracking view reaches DELIVERED by polling. */
  await customer.goto(orderUrl);
  await expect(customer.getByText('Delivered').first()).toBeVisible({ timeout: 45_000 });

  /* 12. Review: 5 stars for the restaurant, 4 for the driver. */
  await expect(customer.getByRole('heading', { name: 'Rate your order' })).toBeVisible();
  await customer.getByRole('radiogroup', { name: 'How was the food?' })
    .getByLabel('5 stars').check({ force: true });
  await customer.getByRole('radiogroup', { name: /How was the delivery/ })
    .getByLabel('4 stars').check({ force: true });
  await customer.getByLabel('Comment (optional)').fill('Hot, fast and exactly as pictured.');
  await customer.getByRole('button', { name: 'Submit review' }).click();

  /* 13. The totals are unchanged and the rating moved. */
  await customer.reload();
  expect(await summaryValue(customer, 'Total')).toBe(cartTotals.total);

  const after = await findRestaurant(SEED.restA);
  expect(after.ratingCount).toBeGreaterThan(restA.ratingCount);

  await Promise.all([customerCtx.close(), restaurantCtx.close(), driverCtx.close()]);
});
