import { test, expect } from '@playwright/test';

test('editor is visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.editable').first()).toBeVisible();
});
