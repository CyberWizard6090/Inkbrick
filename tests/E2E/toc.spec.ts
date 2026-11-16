import { test, expect } from '@playwright/test';

const toc = '[data-inkbrick-block="toc"]';
const link = `${toc} [data-inkbrick-part="link"]`;

test.describe('Table of contents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator('.editable').first().click();
    await page.keyboard.press('Control+End');
  });

  test('is inserted from the slash menu and follows the headings', async ({ page }) => {
    await page.keyboard.press('Enter');
    await page.keyboard.type('# Chapter one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/contents');
    await page.keyboard.press('Enter');

    await expect(page.locator(toc)).toBeVisible();
    await expect(page.locator(link).filter({ hasText: 'Chapter one' })).toHaveCount(1);

    await page.locator('.editable', { hasText: 'Chapter one' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' & two');

    await expect(page.locator(link).filter({ hasText: 'Chapter one & two' })).toHaveCount(1);
  });

  test('a link takes the caret to the heading', async ({ page }) => {
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Target');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/contents');
    await page.keyboard.press('Enter');

    await page.locator(link).filter({ hasText: 'Target' }).click();
    await page.keyboard.type('!');

    await expect(page.locator('.editable', { hasText: '!Target' })).toHaveCount(1);
  });
});
