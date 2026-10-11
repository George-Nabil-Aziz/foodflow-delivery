import { test, expect } from '@playwright/test';
import { findRestaurant, loginAdmin, SEED } from './helpers/api.js';

test('harness: the stack is up and the seeded data is reachable', async ({ page }) => {
  await page.goto('/restaurants');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const restA = await findRestaurant(SEED.restA);
  expect(restA.isOrderable).toBe(true);

  const admin = await loginAdmin();
  expect(admin.user.role).toBe('ADMIN');
});
