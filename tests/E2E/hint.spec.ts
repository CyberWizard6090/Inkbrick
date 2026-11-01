import { test, expect, type Page } from '@playwright/test';

import { useSetting, useTool } from './sandbox';

const content = '[data-inkbrick-part="content"]';

const hintOf = (page: Page, index: number) =>
  page
    .locator(content)
    .nth(index)
    .evaluate((element) => {
      const value = getComputedStyle(element, '::before').content;

      return value === 'none' || value === 'normal' ? '' : value.replace(/^"|"$/g, '');
    });

test.describe('Hint in the empty block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('is not shown until the caret is in the empty block', async ({ page }) => {
    expect(await hintOf(page, 0)).toBe('');
  });

  test('appears in the empty block with the caret and disappears when typing', async ({ page }) => {
    await page.locator('.editable').first().click();
    await expect.poll(() => hintOf(page, 0)).toBe('Press / to open the menu');

    await page.keyboard.type('a');
    await expect.poll(() => hintOf(page, 0)).toBe('');
  });

  test('there is only one hint: it follows the caret and other empty blocks stay clean', async ({
    page,
  }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await expect(page.locator(content)).toHaveCount(3);
    await expect.poll(() => hintOf(page, 2)).toBe('Press / to open the menu');
    expect(await hintOf(page, 1)).toBe('');

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => hintOf(page, 1)).toBe('Press / to open the menu');
    expect(await hintOf(page, 2)).toBe('');
  });

  test('is shown in an empty heading too, but never in a code block', async ({ page }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.type('# ');
    await expect(page.locator('[data-inkbrick-block="heading"]')).toHaveCount(1);
    await expect.poll(() => hintOf(page, 0)).toBe('Press / to open the menu');

    await page.keyboard.press('Enter');
    await page.keyboard.type('```');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-inkbrick-block="code"]')).toHaveCount(1);
    expect(await hintOf(page, 1)).toBe('');
  });

  test('is translated and follows the language switch', async ({ page }) => {
    await useSetting(page, '[data-locale="ru"]');
    await page.locator('.editable').first().click();

    await expect.poll(() => hintOf(page, 0)).toBe('Нажмите «/», чтобы открыть меню');
  });

  test('is not shown in read-only mode', async ({ page }) => {
    await page.goto('/');
    await useTool(page, 'load-sample');
    await page.getByTestId('mode-read').click();
    await page.locator('.editable').last().click();

    expect(await hintOf(page, 0)).toBe('');
    await expect(page.locator('[data-hint]')).toHaveCount(0);
  });
});
