import { test, expect } from '@playwright/test';
import { registerOwner, loginAdmin, approveRestaurant, raw } from './helpers/api.js';

/**
 * TC-402 — Restaurant approval gates visibility.  High.
 *
 * BR-R2. The listing hiding a pending restaurant is not enough: guessing its
 * URL must not work either, or the gate is decoration.
 */
test('TC-402: a pending restaurant is invisible by listing and by direct URL', async ({ page }) => {
  const name = `Hidden Until Approved ${Date.now().toString(36)}`;
  const owner = await registerOwner({ restaurantName: name });
  const restaurantId = owner.restaurant.id;

  // BR-AD10: give it the item approval will require.
  const category = await raw('post', '/api/restaurant/categories', {
    token: owner.token, data: { name: 'Mains' },
  });
  await raw('post', '/api/restaurant/items', {
    token: owner.token,
    data: { categoryId: category.body.data.id, name: 'Hidden Dish', price: '44.00' },
  });

  /* 1. Absent from the listing, and the direct URL is a not-found view. */
  await page.goto('/restaurants');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(name, 'i') })).toHaveCount(0);

  await page.goto(`/restaurants/${restaurantId}`);
  await expect(page.getByText(/no longer available|not found/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name })).toHaveCount(0);

  const beforeApi = await raw('get', `/api/restaurants/${restaurantId}`);
  expect(beforeApi.status).toBe(404);

  /* 2. An admin approves it. */
  const admin = await loginAdmin();
  await approveRestaurant(admin.token, restaurantId);

  /* 3. It is now listed and browsable. */
  await page.goto(`/restaurants?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole('link', { name: new RegExp(name, 'i') }).first()).toBeVisible();

  await page.goto(`/restaurants/${restaurantId}`);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.getByText('Hidden Dish')).toBeVisible();
});
