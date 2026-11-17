import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const part = (name: string) => `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${name}"]`;
const dialog = '[data-testid="column-properties"]';
const bar = '[data-testid="table-view-bar"]';

/** Абзац и под ним таблица 3×3: Name/Qty/Tag, apple/5/x, pear/20/y. */
async function insertTable(page: Page) {
  await page.locator(editable).first().click();
  await page.keyboard.type('before');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');

  const texts = ['Name', 'Qty', 'Tag', 'apple', '5', 'x', 'pear', '20', 'y'];

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Tab');
  }
}

async function openMenu(page: Page, row: number, column: number) {
  const box = (await page
    .locator(cells)
    .nth(row * 3 + column)
    .boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator(part('column-grip')).click();
}

test.describe('Table view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);
  });

  test('a filter from the column properties hides rows and "Show all" brings them back', async ({
    page,
  }) => {
    await openMenu(page, 2, 1);
    await page.getByRole('menuitem', { name: 'Column properties…' }).click();
    await page.locator(`${dialog} [data-inkbrick-part="type"]`).selectOption('number');
    await page.locator(`${dialog} [data-inkbrick-part="filter-op"]`).selectOption('gt');
    await page.locator(`${dialog} [data-inkbrick-part="filter-value"]`).fill('10');
    await page.locator(`${dialog} [data-inkbrick-part="apply"]`).click();

    await expect(page.locator(bar)).toContainText('Filters: 1, rows hidden: 1');
    await expect(page.locator(`${table} tr`).nth(1)).toBeHidden();
    await expect(page.locator(`${table} tr`).nth(2)).toBeVisible();

    await page.locator('[data-inkbrick-part="view-reset"]').click();

    await expect(page.locator(bar)).toHaveCount(0);
    await expect(page.locator(`${table} tr`).nth(1)).toBeVisible();
  });

  test('hiding a column keeps the data and "Show all" restores it', async ({ page }) => {
    await openMenu(page, 1, 2);
    await page.getByRole('menuitem', { name: 'Hide column' }).click();

    await expect(page.locator(bar)).toContainText('Hidden columns: 1');
    await expect(page.locator(cells).nth(2)).toBeHidden();
    await expect(page.locator(cells).nth(5)).toBeHidden();
    await expect(page.locator(cells).nth(1)).toBeVisible();

    await page.locator('[data-inkbrick-part="view-reset"]').click();
    await expect(page.locator(cells).nth(2)).toBeVisible();
    await expect(page.locator(cells).nth(2)).toHaveText('Tag');
  });

  test('Tab skips a hidden column', async ({ page }) => {
    await openMenu(page, 1, 1);
    await page.getByRole('menuitem', { name: 'Hide column' }).click();

    await page.locator(cells).nth(3).click();
    await page.keyboard.press('Tab');
    await page.keyboard.type('!');

    await expect(page.locator(cells).nth(5)).toContainText('x!');
    await expect(page.locator(cells).nth(4)).toHaveText('5');
  });

  test('views keep separate settings: a second view shows everything, the first stays filtered', async ({
    page,
  }) => {
    await openMenu(page, 2, 1);
    await page.getByRole('menuitem', { name: 'Column properties…' }).click();
    await page.locator(`${dialog} [data-inkbrick-part="type"]`).selectOption('number');
    await page.locator(`${dialog} [data-inkbrick-part="filter-op"]`).selectOption('gt');
    await page.locator(`${dialog} [data-inkbrick-part="filter-value"]`).fill('10');
    await page.locator(`${dialog} [data-inkbrick-part="apply"]`).click();
    await expect(page.locator(`${table} tr`).nth(1)).toBeHidden();

    await page.locator('[data-inkbrick-part="view-add"]').click();

    const tabs = page.locator('[data-inkbrick-part="view-tab"]');

    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`${table} tr`).nth(1)).toBeVisible();

    await tabs.nth(0).click();
    await expect(page.locator(`${table} tr`).nth(1)).toBeHidden();

    await tabs.nth(1).dblclick();
    await page.locator('[data-inkbrick-part="view-rename"]').fill('Everything');
    await page.keyboard.press('Enter');
    await expect(tabs.nth(1)).toHaveText('Everything');
  });

  test('sorting the open view reorders the rows on screen only', async ({ page }) => {
    await openMenu(page, 1, 0);
    await page.getByRole('menuitem', { name: 'Sort view ascending' }).click();
    await openMenu(page, 1, 0);
    await page.getByRole('menuitem', { name: 'Sort view descending' }).click();

    await expect(page.locator(`${table} tr`).nth(1).locator('td').first()).toHaveText('pear');
    await expect(page.locator(`${table} tr`).nth(2).locator('td').first()).toHaveText('apple');
  });
});
