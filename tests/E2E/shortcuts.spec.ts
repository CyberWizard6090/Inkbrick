import { test, expect } from '@playwright/test';

import { useTool } from './sandbox';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Shortcuts help and tools menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('the tools menu groups the sample, the large document, the unknown block, Debug, the help, the JSON file and the reset', async ({
    page,
  }) => {
    await page.getByTestId('tools-menu').click();

    await expect(page.locator('[role^="menuitem"]')).toHaveCount(8);
    await expect(page.getByTestId('load-large')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('opens from the menu and from Mod+/, closes with Esc, the button and a click outside', async ({
    page,
  }) => {
    const help = page.getByTestId('shortcuts-help');

    await useTool(page, 'show-shortcuts');
    await expect(help).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);

    await page.locator('.editable').first().click();
    await page.keyboard.press(`${modifier}+/`);
    await expect(help).toBeVisible();
    await page.getByTestId('shortcuts-close').click();
    await expect(help).toHaveCount(0);

    await page.keyboard.press(`${modifier}+/`);
    await page.mouse.click(5, 5);
    await expect(help).toHaveCount(0);
  });

  test('lists the real bindings from the editor keymap', async ({ page }) => {
    await useTool(page, 'show-shortcuts');

    const key = process.platform === 'darwin' ? '⌘B' : 'Ctrl+B';

    await expect(page.getByTestId('shortcuts-help').locator('kbd', { hasText: key })).toHaveCount(
      1,
    );
    await expect(page.getByTestId('shortcuts-help')).toContainText('Bold');
  });
});
