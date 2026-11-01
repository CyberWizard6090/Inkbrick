import { test, expect } from '@playwright/test';

import { useSetting, useTool } from './sandbox';

test.describe('Environment', () => {
  test('works without crypto.randomUUID (opened over http:// on a LAN address, not a secure context)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // В незащищённом контексте браузер не даёт randomUUID — имитируем это до загрузки приложения.
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, 'randomUUID', {
        value: undefined,
        configurable: true,
      });
    });

    await page.goto('/');
    expect(await page.evaluate(() => typeof (crypto as any).randomUUID)).toBe('undefined');

    await page.locator('.editable').first().click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/divider'); // меню открывается в начале блока
    await page.keyboard.press('Enter');

    await expect(page.locator('.editable')).toHaveCount(3); // one, two и параграф под разделителем
    await expect(page.locator('.block-divider')).toHaveCount(1);
    expect(errors).toEqual([]);

    const ids = await page.evaluate(() =>
      Object.keys((window as any).__inkbrick.main.snapshot().blocks),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('no page error while using every sandbox control', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.locator('.inkbrick-editor').first()).toBeVisible();

    await useTool(page, 'load-sample');
    await useTool(page, 'add-unknown');
    await useTool(page, 'toggle-debug');
    await expect(page.getByTestId('debug-panel')).toContainText('page');

    await page.getByTestId('mode-read').click();
    await page.getByTestId('mode-edit').click();
    await useSetting(page, '[data-locale="ru"]');

    await expect(page.locator('[data-unknown-flavour="block:mystery"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
