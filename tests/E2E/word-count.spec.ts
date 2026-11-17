import { test, expect } from '@playwright/test';

import { useTool } from './sandbox';

const counter = '[data-testid="word-count"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Word count', () => {
  test('follows typing, shows the selection against the whole document and speaks Russian', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await page.locator('.editable').first().click();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press('Delete');
    await page.keyboard.type('one two three');

    await expect(page.locator(counter)).toContainText('Words: 3');
    await expect(page.locator(counter)).toContainText('Characters: 13');

    await page.keyboard.press('Shift+Home');
    await expect(page.locator(counter)).toContainText('Words: 3 of 3');

    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.locator(counter)).toContainText('Words: 1 of 3');
    await expect(page.locator(counter)).toContainText('Characters: 3 of 13');
    await expect(page.locator(counter)).toHaveAttribute('title', 'Characters without spaces: 3');

    await page.goto('/?lang=ru');
    await expect(page.locator(counter)).toContainText('Слов:');
    await expect(page.locator(counter)).toContainText('Символов:');
  });

  test('counts the large document without stalling and is on the table page too', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await useTool(page, 'load-large');
    await expect(page.locator('.editable[data-id="large-0"]')).toBeVisible();

    await expect(page.locator(counter)).toContainText(/Words: [\d,\s ]{6,}/);

    await page.goto('/?demo=table&lang=en');
    await expect(page.locator(counter)).toContainText('Words: 6');
  });

  test('does not take the "status" role: pages with their own status region keep exactly one', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await expect(page.locator(counter)).toBeVisible();

    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
