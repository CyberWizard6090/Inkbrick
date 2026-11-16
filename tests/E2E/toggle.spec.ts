import { test, expect } from '@playwright/test';

const editable = '.editable';
const toggle = '[data-inkbrick-block="toggle"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Toggle block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+End`);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/toggle');
    await page.keyboard.press('Enter');
  });

  test('from the slash menu; Enter at the end puts the caret inside; the arrow hides the content', async ({
    page,
  }) => {
    await expect(page.locator(toggle)).toHaveCount(1);

    await page.keyboard.type('Details');
    await page.keyboard.press('Enter');
    await page.keyboard.type('hidden text');

    const inside = page.locator(`${toggle} [data-inkbrick-part="children"] ${editable}`);

    await expect(inside).toHaveText('hidden text');
    await expect(page.locator(`${toggle} [data-inkbrick-part="toggle"]`)).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await page.locator(`${toggle} [data-inkbrick-part="toggle"]`).click();

    await expect(page.locator(`${toggle} [data-inkbrick-part="toggle"]`)).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(inside).toHaveCount(0);

    await page.keyboard.press(`${modifier}+z`);
    await expect(inside).toHaveText('hidden text');
  });

  test('Enter in an empty nested paragraph leaves the toggle', async ({ page }) => {
    await page.keyboard.type('Details');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('outside');

    await expect(page.locator(`${toggle} [data-inkbrick-part="children"] ${editable}`)).toHaveCount(
      0,
    );
    await expect(page.locator(editable).last()).toHaveText('outside');
  });
});
