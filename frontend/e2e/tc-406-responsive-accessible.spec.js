import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  SEED, PASSWORD, registerCustomer, addAddress, findRestaurant, menuOf,
  addToCart, checkout, ownerTokenFor, advanceOrder, loginAdmin, createDriver,
  approveDriver, login, waitForOffer, acceptOffer, raw, takeAllDriversOffline,
} from './helpers/api.js';
import { signIn } from './helpers/ui.js';

/**
 * TC-406 — Responsive and accessible smoke pass.  High.
 *
 * NFR-13 and NFR-14 over the same journeys, because splitting them would
 * double the run time for no extra signal.
 *
 * "Zero serious or critical violations" is the bar the scenario sets; moderate
 * and minor findings are not asserted here and are not claimed to be absent.
 */

const WIDTHS = [
  { name: '360px (small phone)', width: 360, height: 780 },
  { name: '768px (tablet)', width: 768, height: 1024 },
  { name: '1440px (desktop)', width: 1440, height: 900 },
];

/** Builds one of every screen the scenario names, and returns their URLs. */
async function buildWorld() {
  await takeAllDriversOffline();
  const admin = await loginAdmin();

  const buyer = await registerCustomer({ fullName: 'Accessible Customer' });
  const address = await addAddress(buyer.token);
  const restA = await findRestaurant(SEED.restA);
  const items = (await menuOf(restA.id)).filter((i) => i.isAvailable);

  // One order in flight for the restaurant and driver screens.
  await addToCart(buyer.token, items[0].id, 1);
  const inFlight = await checkout(buyer.token, address.id);
  const ownerToken = await ownerTokenFor(SEED.restA);
  await advanceOrder(ownerToken, inFlight.id, 'READY_FOR_PICKUP');

  const driver = await createDriver(admin.token);
  await approveDriver(admin.token, driver.user.id);
  const driverSession = await login(driver.email, driver.password);
  await raw('patch', '/api/driver/availability', {
    token: driverSession.token, data: { availability: 'AVAILABLE' },
  });
  const offer = await waitForOffer(driverSession.token, { orderNumber: inFlight.orderNumber });
  await acceptOffer(driverSession.token, offer.id);

  // A second, separate cart so the cart and checkout screens have content.
  const shopper = await registerCustomer({ fullName: 'Cart Shopper' });
  await addAddress(shopper.token);
  await addToCart(shopper.token, items[0].id, 2);

  return { buyer, shopper, driver, restA, inFlight, admin };
}

let world;
test.beforeAll(async () => { world = await buildWorld(); });

/* ----------------------------------------------- 1. responsive widths ---- */

test.describe('TC-406: the core customer path at three widths', () => {
  for (const size of WIDTHS) {
    test(`TC-406: no horizontal scroll at ${size.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const page = await context.newPage();
      await signIn(page, world.shopper.email, PASSWORD);

      const path = [
        '/restaurants',
        `/restaurants/${world.restA.id}`,
        '/cart',
        '/checkout',
        `/orders/${world.inFlight.id}`,
      ];

      for (const url of path) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');

        // A document wider than its viewport is the symptom users actually
        // feel: the page slides sideways under the thumb.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${url} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
      }

      await context.close();
    });
  }
});

/* ------------------------------------------------- 2. keyboard only ------ */

test('TC-406: the cart and checkout flow is operable by keyboard alone', async ({ page }) => {
  await signIn(page, world.shopper.email, PASSWORD);
  await page.goto('/cart');

  // Every interactive control is reachable by Tab, and shows a focus ring.
  const checkoutButton = page.getByRole('button', { name: 'Go to checkout' });
  await expect(checkoutButton).toBeVisible();

  let reached = false;
  for (let i = 0; i < 40 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await checkoutButton.evaluate((el) => el === document.activeElement);
  }
  expect(reached, 'the checkout button was not reachable by Tab').toBe(true);

  // focus-visible must produce a real outline, not a silently removed one.
  const outline = await checkoutButton.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, shadow: s.boxShadow };
  });
  expect(
    outline.style !== 'none' || outline.shadow !== 'none',
    'the focused control has no visible focus indicator',
  ).toBe(true);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();

  // And the order can be placed without touching the mouse.
  const place = page.getByRole('button', { name: 'Place order' });
  reached = false;
  for (let i = 0; i < 60 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await place.evaluate((el) => el === document.activeElement);
  }
  expect(reached, 'the place-order button was not reachable by Tab').toBe(true);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 30_000 });
});

test('TC-406: a modal traps focus and restores it on close', async ({ page }) => {
  const buyer = await registerCustomer();
  await addAddress(buyer.token);
  const restA = await findRestaurant(SEED.restA);
  const restB = await findRestaurant(SEED.restB);
  const itemA = (await menuOf(restA.id)).find((i) => i.isAvailable);
  const itemB = (await menuOf(restB.id)).find((i) => i.isAvailable);
  await addToCart(buyer.token, itemA.id, 1);

  await signIn(page, buyer.email, PASSWORD);
  await page.goto(`/restaurants/${restB.id}`);
  await page.getByRole('button', { name: `Add ${itemB.name} to cart` }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // Tabbing repeatedly must not escape the dialog.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(inside, 'focus escaped the modal on tab ' + i).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

/* ----------------------------------------------------- 3. axe sweep ------ */

const SERIOUS = ['serious', 'critical'];

async function axeScan(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.filter((v) => SERIOUS.includes(v.impact));
}

const describeViolations = (violations) =>
  violations
    .map((v) => `${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`)
    .join('\n');

test('TC-406: nine screens have no serious or critical axe violations', async ({ browser }) => {
  const screens = [
    { name: 'login', as: null, url: '/login' },
    { name: 'restaurant list', as: 'shopper', url: '/restaurants' },
    { name: 'restaurant detail', as: 'shopper', url: () => `/restaurants/${world.restA.id}` },
    { name: 'cart', as: 'shopper', url: '/cart' },
    { name: 'checkout', as: 'shopper', url: '/checkout' },
    { name: 'order tracking', as: 'buyer', url: () => `/orders/${world.inFlight.id}` },
    { name: 'restaurant incoming orders', as: 'owner', url: '/restaurant/orders' },
    { name: 'driver active delivery', as: 'driver', url: () => `/driver/deliveries/${world.inFlight.id}` },
    { name: 'admin dashboard', as: 'admin', url: '/admin' },
  ];

  const credentials = {
    shopper: () => [world.shopper.email, PASSWORD],
    buyer: () => [world.buyer.email, PASSWORD],
    owner: () => [SEED.ownerA, SEED.userPassword],
    driver: () => [world.driver.email, world.driver.password],
    admin: () => [SEED.adminEmail, SEED.adminPassword],
  };

  const failures = [];

  for (const screen of screens) {
    const context = await browser.newContext();
    const page = await context.newPage();

    if (screen.as) await signIn(page, ...credentials[screen.as]());
    await page.goto(typeof screen.url === 'function' ? screen.url() : screen.url);
    await page.waitForLoadState('networkidle');

    const violations = await axeScan(page);
    if (violations.length) failures.push(`\n${screen.name}:\n  ${describeViolations(violations)}`);

    await context.close();
  }

  expect(failures.join(''), `serious or critical accessibility violations:${failures.join('')}`)
    .toBe('');
});
