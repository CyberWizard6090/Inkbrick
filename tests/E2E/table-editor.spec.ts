import { test, expect } from '@playwright/test';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const cells = '[data-inkbrick-block="table"] td';
const value = '[data-testid="table-value"]';

test.describe('Standalone table editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo=table&lang=en');
    await expect(page.locator(cells)).toHaveCount(6);
  });

  test('edits cells and reports the value outside the editor', async ({ page }) => {
    await page.locator(cells).nth(5).click();
    await page.keyboard.press('End');
    await page.keyboard.type('0');
    await page.keyboard.press('Tab');
    await page.keyboard.type('x');

    await expect(page.locator(value)).toHaveText(
      JSON.stringify([
        ['Fruit', 'Qty'],
        ['Apple', '3'],
        ['Pear', '50'],
        ['x', ''],
      ]),
    );
    await expect(page.locator('[data-testid="table-markdown"]')).toContainText('| Pear');
  });

  test('has no block handle and no slash menu', async ({ page }) => {
    await page.locator(cells).first().hover();
    await expect(page.locator('[data-inkbrick-ui="block-handle"]')).toHaveCount(0);

    await page.locator(cells).nth(2).click();
    await page.keyboard.type('/');
    await expect(page.locator('[data-testid="slash-menu"]')).toHaveCount(0);
  });

  test('the table cannot be deleted or left', async ({ page }) => {
    await page.locator(cells).first().click();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press('Delete');
    await expect(page.locator(cells)).toHaveCount(6);

    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await page.keyboard.type('still here');

    await expect(page.locator(cells)).toHaveCount(6);
    await expect(page.locator('[data-inkbrick-block="table"]')).toHaveCount(1);
    await expect(page.locator('[data-inkbrick-root] > *')).toHaveCount(1);
  });

  test('undo takes back the last edit', async ({ page }) => {
    await page.locator(cells).nth(1).click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(page.locator(value)).toContainText('Qty!');

    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(value)).not.toContainText('Qty!');
  });
});
