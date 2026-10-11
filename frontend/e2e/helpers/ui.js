import { expect } from '@playwright/test';

/**
 * Page-level helpers shared by the scenarios.
 *
 * Selectors go through roles and labels rather than CSS classes: a class is a
 * styling decision that will change, while "the button called Accept order" is
 * the thing the scenario actually describes.
 */

/**
 * On a phone the navigation lives in a drawer behind the menu button. Opens
 * it when it is there, so the same assertions hold at every width.
 */
async function openMenuIfCollapsed(page) {
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  return menu;
}

export async function signIn(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for the sign-in to land before deciding which navigation is showing.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await openMenuIfCollapsed(page);
  await expect(page.getByRole('link', { name: 'Sign out' }).or(
    page.getByRole('button', { name: 'Sign out' }),
  )).toBeVisible();
  // Leave the page as the scenario expects it: drawer closed.
  if (await page.getByRole('button', { name: 'Close menu' }).isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
  }
}

export async function signOut(page) {
  const button = page.getByRole('button', { name: 'Sign out' });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  }
}

/**
 * Finds a restaurant the way a customer does in a 100-restaurant listing: by
 * searching for it. Assuming it sits on page one stopped being true once the
 * seed filled the marketplace.
 */
export async function openRestaurant(page, name) {
  await page.goto(`/restaurants?q=${encodeURIComponent(name)}`);
  await page.getByRole('link', { name: new RegExp(name, 'i') }).first().click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

export async function addItemToCart(page, itemName) {
  await page.getByRole('button', { name: `Add ${itemName} to cart` }).click();
}

export const cartBadge = (page) => page.getByRole('link', { name: /^Cart/ });

export async function expectCartCount(page, count) {
  await expect(cartBadge(page)).toContainText(String(count));
}

/** The order summary rows are a definition list, so read the dd next to the dt. */
export async function summaryValue(page, term) {
  const row = page.locator('div.flex.justify-between', { has: page.getByText(term, { exact: true }) });
  return (await row.first().locator('dd').innerText()).trim();
}

export async function checkoutFromCart(page) {
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Go to checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 30_000 });
}

/** Restaurant order cards are keyed by their order number. */
export const orderCard = (page, orderNumber) =>
  page.locator('li', { hasText: orderNumber }).first();

export async function restaurantAct(page, orderNumber, buttonName) {
  await orderCard(page, orderNumber).getByRole('button', { name: buttonName }).click();
}

/**
 * Fills and confirms a ConfirmDialog, then waits for the action to land.
 *
 * The dialog closes as the request is sent rather than when it returns, so a
 * caller that reads the API immediately afterwards races it. Waiting for the
 * network to settle makes the helper mean "the action happened", which is what
 * every caller actually wants.
 */
export async function confirmDialog(page, { reason, reasonCode, confirmLabel }) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (reasonCode) await dialog.locator('#confirm-reason-code').selectOption(reasonCode);
  if (reason) await dialog.locator('#confirm-reason').fill(reason);
  await dialog.getByRole('button', { name: confirmLabel }).click();
  await expect(dialog).toBeHidden();
  await page.waitForLoadState('networkidle');
}

/**
 * Waits for a status badge to reach `label` on a polled view.
 *
 * The tracking screen polls rather than subscribing, so the assertion has to
 * tolerate one polling interval instead of expecting an immediate change.
 */
export async function expectStatus(page, label, timeout = 40_000) {
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout });
}
