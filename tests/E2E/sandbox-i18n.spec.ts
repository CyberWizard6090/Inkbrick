import { test, expect } from '@playwright/test';

import { openSettings, useSetting, useTool } from './sandbox';

test.describe('Sandbox interface language', () => {
  test('English by default; the dictionary follows the editor language', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('mode-edit')).toHaveText('Edit');
    await expect(page.getByTestId('mode-read')).toHaveText('Read');
    await expect(page.getByTestId('tools-menu')).toContainText('Tools');
    await expect(page.getByTestId('settings-menu')).toContainText('Settings');
    await expect(page.locator('.playground-header')).toHaveText('Editor playground');
  });

  test('Russian translates the buttons, the menus and the page title without a reload', async ({
    page,
  }) => {
    await page.goto('/');
    await useSetting(page, '[data-locale="ru"]');

    await expect(page.getByTestId('mode-edit')).toHaveText('Редактирование');
    await expect(page.getByTestId('mode-read')).toHaveText('Чтение');
    await expect(page.getByTestId('tools-menu')).toContainText('Инструменты');
    await expect(page.getByTestId('settings-menu')).toContainText('Настройки');
    await expect(page.locator('.playground-header')).toHaveText('Тестирование редактора');

    await page.getByTestId('tools-menu').click();
    await expect(page.getByTestId('export-json')).toContainText('Скачать JSON');
    await expect(page.getByTestId('reset-data')).toContainText('Сбросить данные');
  });

  test('a language without a sandbox dictionary (German) shows English', async ({ page }) => {
    await page.goto('/?lang=de');

    await expect(page.getByTestId('mode-edit')).toHaveText('Edit');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('the choice survives a reload', async ({ page }) => {
    await page.goto('/?lang=ru');
    await page.reload();

    await expect(page.getByTestId('mode-read')).toHaveText('Чтение');
  });

  test('the keyboard shortcuts cheat sheet, the Debug panel and the notices are translated', async ({
    page,
  }) => {
    await page.goto('/?lang=ru');

    await useTool(page, 'show-shortcuts');
    await expect(page.getByTestId('shortcuts-help')).toContainText('Форматирование текста');
    await expect(page.getByTestId('shortcuts-help')).toContainText('Жирный');
    await page.keyboard.press('Escape');

    await useTool(page, 'toggle-debug');
    await expect(page.getByTestId('debug-panel')).toContainText('Дерево');
    await expect(page.getByTestId('debug-panel')).toContainText('блоков');

    await page.getByTestId('import-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not json'),
    });
    await expect(page.getByTestId('notice')).toContainText('Файл не является JSON');
  });

  test('a visible notice is translated again when the language changes', async ({ page }) => {
    await page.goto('/?lang=en');

    await page.getByTestId('import-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not json'),
    });
    await expect(page.getByTestId('notice')).toContainText('The file is not JSON');

    await useSetting(page, '[data-locale="ru"]');

    await expect(page.getByTestId('notice')).toContainText('Файл не является JSON');
  });

  test('the cheat sheet describes headings 1–6', async ({ page }) => {
    await page.goto('/?lang=en');
    await useTool(page, 'show-shortcuts');

    await expect(page.getByTestId('shortcuts-help')).toContainText('Heading 1–6');
  });
});

test.describe('Settings menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('groups the theme and the language', async ({ page }) => {
    await expect(page.getByTestId('settings-menu-list')).toHaveCount(0);

    await openSettings(page);

    const list = page.getByTestId('settings-menu-list');

    await expect(list.locator('[data-theme]')).toHaveCount(3);
    await expect(list.locator('[data-locale]')).toHaveText(['EN', 'RU', 'DE']);
    await expect(list.getByTestId('toggle-debug')).toHaveCount(0);
  });

  test('closes after a choice, with Esc and with a click outside', async ({ page }) => {
    await useSetting(page, '[data-theme="dark"]');
    await expect(page.getByTestId('settings-menu-list')).toHaveCount(0);

    await openSettings(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-menu-list')).toHaveCount(0);

    await openSettings(page);
    await page.mouse.click(5, 400);
    await expect(page.getByTestId('settings-menu-list')).toHaveCount(0);
  });

  test('shows the current language and theme', async ({ page }) => {
    await openSettings(page);

    await expect(page.locator('[data-locale="en"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-theme="auto"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Debug panel in the Tools menu', () => {
  test('is a checkbox item of the Tools menu that toggles the panel on and off', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await page.getByTestId('tools-menu').click();

    const item = page.getByRole('menuitemcheckbox', { name: /Debug panel/ });

    await expect(item).toHaveAttribute('aria-checked', 'false');
    await item.click();
    await expect(page.getByTestId('debug-panel')).toBeVisible();

    await page.getByTestId('tools-menu').click();
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await item.click();
    await expect(page.getByTestId('debug-panel')).toHaveCount(0);
  });

  test('is not in the Settings menu', async ({ page }) => {
    await page.goto('/?lang=en');
    await openSettings(page);

    await expect(page.getByTestId('toggle-debug')).toHaveCount(0);
  });
});
