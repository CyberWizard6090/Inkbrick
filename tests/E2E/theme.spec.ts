import { test, expect, type Page } from '@playwright/test';

import { openSettings, useSetting } from './sandbox';

const bg = (page: Page) =>
  page.locator('.playground-content').evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe('Theme switch', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/?lang=en');
  });

  test('light and dark are forced regardless of the system setting; auto follows it', async ({
    page,
  }) => {
    const light = await bg(page);

    await useSetting(page, '[data-theme="dark"]');
    await expect(page.locator('html')).toHaveAttribute('data-inkbrick-theme', 'dark');
    expect(await bg(page)).not.toBe(light);

    await useSetting(page, '[data-theme="auto"]');
    await expect(page.locator('html')).not.toHaveAttribute('data-inkbrick-theme');
    expect(await bg(page)).toBe(light);

    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await bg(page)).not.toBe(light);

    await useSetting(page, '[data-theme="light"]');
    expect(await bg(page)).toBe(light);
  });

  test('the choice survives a reload', async ({ page }) => {
    await useSetting(page, '[data-theme="dark"]');
    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-inkbrick-theme', 'dark');
    await openSettings(page);
    await expect(page.locator('[data-theme="dark"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Color palette', () => {
  const swatch = (page: Page, kind: string, color: string) =>
    page.locator(`[data-inkbrick-part="panel"][data-kind="${kind}"] [data-color="${color}"]`);

  test('has black and white; text color black/white is stored and rendered', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator('.editable').first().click();
    await page.keyboard.type('mono');
    await page.keyboard.press('Shift+Home');

    await page.locator('[data-testid="toolbar"] [data-format="color"]').click();
    await expect(swatch(page, 'color', 'black')).toBeVisible();
    await expect(swatch(page, 'color', 'white')).toBeVisible();

    await swatch(page, 'color', 'white').click();

    const color = await page
      .locator('[data-inkbrick-color="white"]')
      .evaluate((el) => getComputedStyle(el).color);

    expect(color).toBe('rgb(255, 255, 255)');
  });

  test('highlight black and white fill the background', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator('.editable').first().click();
    await page.keyboard.type('mark');
    await page.keyboard.press('Shift+Home');

    await page.locator('[data-testid="toolbar"] [data-format="highlight"]').click();
    await swatch(page, 'highlight', 'black').click();

    expect(
      await page
        .locator('[data-inkbrick-bg="black"]')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(0, 0, 0)');
  });

  test('every palette color has its own look in both themes (no two the same)', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await page.locator('.editable').first().click();
    await page.keyboard.type('x');
    await page.keyboard.press('Shift+Home');
    await page.locator('[data-testid="toolbar"] [data-format="highlight"]').click();

    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (t) => document.documentElement.setAttribute('data-inkbrick-theme', t),
        theme,
      );

      const colors = await page
        .locator(
          '[data-inkbrick-part="panel"][data-kind="highlight"] [data-color]:not([data-color=""])',
        )
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));

      expect(colors).toHaveLength(11);
      expect(new Set(colors).size).toBe(11);
    }
  });
});
