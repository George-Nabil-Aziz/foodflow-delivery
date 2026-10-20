import { test, expect } from '@playwright/test';
import {
  PASSWORD, SEED, uniqueEmail, loginAdmin, adminRestaurants, login,
  registerCustomer, addAddress, addToCart, checkout, menuOf, raw,
} from './helpers/api.js';
import { signIn, orderCard } from './helpers/ui.js';

const PENDING_BANNER = /Your restaurant is awaiting approval/;

/**
 * TC-394 — Restaurant journey: onboarding through fulfilment.  Critical.
 *
 * The claim is that each stage is gated: an unapproved restaurant can build its
 * menu but is invisible to customers and cannot trade, and only an admin's
 * approval opens it.
 */
test('TC-394: restaurant onboarding through fulfilment', async ({ browser }) => {
  const restaurantCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const owner = await restaurantCtx.newPage();
  const adminPage = await adminCtx.newPage();

  const restaurantName = `E2E Bistro ${Date.now().toString(36)}`;
  const email = uniqueEmail('bistro');

  /* 1. Register as an owner and land on a gated dashboard. */
  await owner.goto('/register');
  await owner.getByText('Run a restaurant').click();
  await owner.getByLabel('Your name').fill('Bistro Owner');
  await owner.getByLabel('Restaurant name').fill(restaurantName);
  await owner.getByLabel('Email').fill(email);
  await owner.getByLabel('Phone').fill('01002234567');
  await owner.getByLabel('Password').fill(PASSWORD);
  await owner.getByRole('button', { name: 'Create account' }).click();

  // Wait for the redirect rather than navigating over the in-flight request.
  await owner.waitForURL('**/restaurant', { timeout: 30_000 });
  await expect(owner.getByRole('status').filter({ hasText: PENDING_BANNER })).toBeVisible();

  // Menu and order navigation is disabled, with the reason attached rather
  // than the items being hidden.
  const nav = owner.getByRole('navigation', { name: 'Section' });
  for (const label of ['Orders', 'Menu items', 'Categories']) {
    await expect(nav.locator('[aria-disabled="true"]', { hasText: label })).toHaveCount(1);
  }

  const ownerSession = await login(email, PASSWORD);

  // The gate is the server's, not a hidden button: the restaurant is simply
  // absent from the public listing.
  const listing = await raw('get', `/api/restaurants?q=${encodeURIComponent(restaurantName)}`);
  expect(listing.body.data.some((r) => r.name === restaurantName)).toBe(false);

  /* 2. Complete the profile and set a full week of opening hours. */
  await owner.goto('/restaurant/profile');
  await owner.getByLabel('Description').fill('An end-to-end test bistro.');
  await owner.getByLabel('Street address').fill('12 Test Street');
  await owner.getByLabel('City').fill('Cairo');
  await owner.getByLabel('District').fill('Zamalek');
  await owner.getByRole('button', { name: /^Save/ }).first().click();

  const hoursRes = await raw('put', '/api/restaurant/hours', {
    token: ownerSession.token,
    data: {
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek, opensAt: '08:00', closesAt: '23:30', isClosed: false,
      })),
    },
  });
  expect(hoursRes.status).toBe(200);

  /* 3. Two categories and three items, while still pending. */
  await owner.goto('/restaurant/categories');
  for (const name of ['Starters', 'Mains']) {
    await owner.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await owner.getByRole('button', { name: 'Create category' }).click();
    await expect(owner.getByText(name, { exact: true }).first()).toBeVisible();
  }

  await owner.goto('/restaurant/menu');
  for (const [name, price] of [['Soup', '20.00'], ['Steak', '95.00'], ['Cake', '25.00']]) {
    await owner.getByRole('button', { name: 'Add item' }).first().click();
    const form = owner.locator('form');
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await form.getByRole('textbox', { name: 'Price', exact: true }).fill(price);
    await form.getByRole('button', { name: 'Add item' }).click();
    await expect(owner.getByText(name, { exact: true }).first()).toBeVisible();
  }

  /* 4. Admin approves from the pending queue. */
  await signIn(adminPage, SEED.adminEmail, SEED.adminPassword);
  // The pending queue is its own tab; ?status= opens it directly.
  await adminPage.goto('/admin/restaurants?status=PENDING_APPROVAL');
  const pendingRow = adminPage.locator('li', { hasText: restaurantName }).first();
  await expect(pendingRow).toBeVisible();
  await pendingRow.getByRole('button', { name: 'Approve' }).click();
  await expect(adminPage.locator('li', { hasText: restaurantName })
    .getByRole('button', { name: 'Approve' })).toHaveCount(0, { timeout: 20_000 });

  /* 5. Reload: the banner is gone and the restaurant is public. */
  await owner.goto('/restaurant');
  await expect(owner.getByText('Open and accepting orders')).toBeVisible();
  await expect(owner.getByRole('status').filter({ hasText: PENDING_BANNER })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Menu items' })).toBeVisible();

  const nowListed = await raw('get', `/api/restaurants?q=${encodeURIComponent(restaurantName)}`);
  expect(nowListed.body.data.some((r) => r.name === restaurantName)).toBe(true);

  /* 6. Availability toggles off and back on. */
  await owner.goto('/restaurant/menu');
  const steakRow = owner.locator('li', { hasText: 'Steak' }).first();
  await steakRow.getByLabel('Steak is available').uncheck();
  await expect(steakRow.getByLabel('Steak is unavailable')).toBeVisible();
  await steakRow.getByLabel('Steak is unavailable').check();
  await expect(steakRow.getByLabel('Steak is available')).toBeVisible();

  /* 7. A customer's order flows through accept, prepare, ready. */
  const admin = await loginAdmin();
  const created = (await adminRestaurants(admin.token, `?q=${encodeURIComponent(restaurantName)}`))
    .find((r) => r.name === restaurantName);

  const buyer = await registerCustomer();
  const address = await addAddress(buyer.token);
  const items = (await menuOf(created.id)).filter((i) => i.isAvailable);
  await addToCart(buyer.token, items[0].id, 2);
  const order = await checkout(buyer.token, address.id);

  await owner.goto('/restaurant/orders');
  const card = orderCard(owner, order.orderNumber);
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Accept order' }).click();
  await expect(card.getByRole('button', { name: 'Start preparing' })).toBeVisible();
  await card.getByRole('button', { name: 'Start preparing' }).click();
  await expect(card.getByRole('button', { name: 'Mark ready for pickup' })).toBeVisible();
  await card.getByRole('button', { name: 'Mark ready for pickup' }).click();
  await expect(card.getByText('Ready for pickup')).toBeVisible();

  await Promise.all([restaurantCtx.close(), adminCtx.close()]);
});
