import { test, expect } from '@playwright/test';

const editable = '.editable';
const menu = '[data-testid="slash-menu"]';
const toolbar = '[data-testid="toolbar"]';

test.describe('Slash menu groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator(editable).first().click();
    await page.keyboard.type('/');
  });

  test('items are under headings: basic, media, advanced; the table is a basic block', async ({
    page,
  }) => {
    await expect(page.locator(menu)).toBeVisible();

    const groups = page.locator(`${menu} [data-inkbrick-part="group"]`);

    await expect(groups.first()).toHaveText('Basic blocks');
    await expect(groups.nth(1)).toHaveText('Media');
    await expect(groups.nth(2)).toHaveText('Advanced');

    // Порядок на экране: заголовок «Основные», затем пункты, среди которых таблица, и только потом «Медиа».
    const order = await page
      .locator(menu)
      .evaluate((root) =>
        [...root.children].map((child) =>
          child.getAttribute('data-group')
            ? `#${child.getAttribute('data-group')}`
            : child.getAttribute('data-slash-item'),
        ),
      );

    expect(order.indexOf('table')).toBeGreaterThan(order.indexOf('#basic'));
    expect(order.indexOf('table')).toBeLessThan(order.indexOf('#media'));
    expect(order.indexOf('image')).toBeGreaterThan(order.indexOf('#media'));
    expect(order.indexOf('code')).toBeGreaterThan(order.indexOf('#advanced'));
  });

  test('the headings go away while a query is typed', async ({ page }) => {
    await page.keyboard.type('head');

    await expect(page.locator(`${menu} [data-inkbrick-part="group"]`)).toHaveCount(0);
  });
});

test.describe('Turn into', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en&formatting=toolbar');
    await page.locator(editable).first().click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.type('some text');
    await page.keyboard.press('Shift+Home');
  });

  test('the toolbar changes the type of the block and the text stays selected', async ({
    page,
  }) => {
    await expect(page.locator(`${toolbar} [data-format="turn-into"]`)).toContainText('Text');

    await page.locator(`${toolbar} [data-format="turn-into"]`).click();
    await page.locator(`${toolbar} [data-action="heading-1"]`).click();

    await expect(page.locator('.block-heading.level-1')).toHaveText('some text');
    expect(await page.evaluate(() => getSelection()!.toString())).toBe('some text');

    await page.keyboard.press('Control+z');
    await expect(page.locator('.block-heading')).toHaveCount(0);
  });

  test('a selection across blocks has no converter', async ({ page }) => {
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');
    await page.keyboard.press('Shift+ArrowUp');

    await expect(page.locator(toolbar)).toBeVisible();
    await expect(page.locator(`${toolbar} [data-format="turn-into"]`)).toHaveCount(0);
  });
});
