import { test, expect } from '@playwright/test';

import { openSettings, useSetting } from './sandbox';

const content = '[data-inkbrick-part="content"]';
const switcher = '[data-testid="locale-switch"]';

test.describe('Localization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('English is the default and the switcher lists built-in and connected dictionaries', async ({
    page,
  }) => {
    await expect(page.locator(content).first()).toHaveAttribute(
      'data-hint',
      'Press / to open the menu',
    );
    await openSettings(page);
    await expect(page.locator(`${switcher} button`)).toHaveText(['EN', 'RU', 'DE']);
    await expect(page.locator(`${switcher} [data-locale="en"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('switching to Russian translates the open editor without a reload', async ({ page }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.type('hello');
    await useSetting(page, `${switcher} [data-locale="ru"]`);

    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('.editable').first()).toHaveText('hello');

    await page.locator('.editable').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(page.locator(content).nth(1)).toHaveAttribute(
      'data-hint',
      'Нажмите «/», чтобы открыть меню',
    );

    await page.keyboard.type('/');
    const menu = page.locator('[data-inkbrick-ui="slash-menu"]');

    await expect(menu).toContainText('Заголовок 1');
    await expect(menu).toContainText('Список задач');
  });

  test('the slash menu search understands words of the selected language', async ({ page }) => {
    await useSetting(page, `${switcher} [data-locale="ru"]`);
    await page.locator('.editable').first().click();
    await page.keyboard.type('/цитат');

    await expect(
      page.locator('[data-inkbrick-ui="slash-menu"] [data-inkbrick-part="item"]'),
    ).toHaveCount(1);
    await expect(page.locator('[data-slash-item="quote"]')).toContainText('Цитата');
  });

  test('a connected partial dictionary (German) falls back to English for missing keys', async ({
    page,
  }) => {
    await useSetting(page, `${switcher} [data-locale="de"]`);
    await page.locator('.editable').first().click();
    await page.keyboard.type('/');

    const menu = page.locator('[data-inkbrick-ui="slash-menu"]');

    await expect(menu).toContainText('Überschrift 1');
    await expect(menu).toContainText('Aufgabenliste');
  });

  test('the choice survives a reload (address and localStorage)', async ({ page }) => {
    await useSetting(page, `${switcher} [data-locale="ru"]`);
    await expect(page).toHaveURL(/lang=ru/);

    await page.goto('/');
    await expect(page.locator(content).first()).toHaveAttribute(
      'data-hint',
      'Нажмите «/», чтобы открыть меню',
    );
    await openSettings(page);
    await expect(page.locator(`${switcher} [data-locale="ru"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('?lang= with an unknown code falls back to English', async ({ page }) => {
    await page.goto('/?lang=xx');

    await expect(page.locator(content).first()).toHaveAttribute(
      'data-hint',
      'Press / to open the menu',
    );
  });

  test('the block menu, toolbar and image picker are translated', async ({ page }) => {
    await page.goto('/?lang=ru');
    await page.locator('.editable').first().click();
    await page.keyboard.type('/изображ');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('image-picker')).toContainText('Вставить');
    await expect(page.getByPlaceholder('Вставьте ссылку на изображение…')).toBeVisible();

    await page.locator('.editable').first().hover();
    await expect(
      page.locator('[data-inkbrick-ui="block-handle"] [data-action="grip"]'),
    ).toHaveAttribute('aria-label', 'Перетащите, чтобы переместить, или нажмите для параметров');
  });
});
