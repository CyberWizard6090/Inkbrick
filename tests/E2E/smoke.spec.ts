import { test, expect } from '@playwright/test';

test('application opens', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Inkbrick/i);
});
