import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Абзац «before», под ним таблица 3×3 из slash-меню; курсор — в первой ячейке. */
async function insertTable(page: Page) {
  await page.locator(editable).first().click();
  await page.keyboard.type('before');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await expect(page.locator('[data-inkbrick-ui="slash-menu"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator(table)).toBeVisible();
}

const grid = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-inkbrick-block="table"] tr')].map((row) =>
      [...row.querySelectorAll('td .editable')].map((cell) => cell.textContent),
    ),
  );

async function fill(page: Page, values: string[]) {
  for (const [i, value] of values.entries()) {
    await page.keyboard.type(value);
    if (i < values.length - 1) await page.keyboard.press('Tab');
  }
}

test.describe('Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('the slash menu inserts a 3×3 table and typing starts in its first cell', async ({
    page,
  }) => {
    await insertTable(page);
    await page.keyboard.type('first');

    expect(await grid(page)).toEqual([
      ['first', '', ''],
      ['', '', ''],
      ['', '', ''],
    ]);
  });

  test('Tab moves through the cells and adds a row after the last one', async ({ page }) => {
    await insertTable(page);
    await fill(page, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);

    expect(await grid(page)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
      ['j', '', ''],
    ]);

    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('!');
    expect((await grid(page))[2]).toEqual(['g', 'h', 'i!']);
  });

  test('Enter stays in the cell; Backspace at its start does not merge cells', async ({ page }) => {
    await insertTable(page);
    await fill(page, ['a', 'b']);
    await page.keyboard.press('Enter');
    await page.keyboard.type('c');

    expect((await grid(page))[0]).toEqual(['a', 'b\nc', '']);

    await page.keyboard.press(`${modifier}+Home`);
    await page.locator(cells).nth(1).locator(editable).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');

    expect((await grid(page))[0]).toEqual(['a', 'b\nc', '']);
    await expect(page.locator(cells)).toHaveCount(9);
  });

  test('a click on a cell, also beside its text, puts the caret into that cell', async ({
    page,
  }) => {
    await insertTable(page);
    await fill(page, ['a', 'b', 'c', 'd', 'e', 'f']);

    const box = (await page.locator(cells).nth(4).boundingBox())!;

    await page.mouse.click(box.x + box.width - 6, box.y + box.height / 2);
    await page.keyboard.type('!');

    expect((await grid(page))[1]).toEqual(['d', 'e!', 'f']);
  });

  test('formatting works in a cell', async ({ page }) => {
    await insertTable(page);
    await page.keyboard.type('bold');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press(`${modifier}+b`);

    await expect(page.locator(cells).first().locator('strong')).toHaveText('bold');
  });

  test('deleting a selection across cells clears text and keeps the grid', async ({ page }) => {
    await insertTable(page);
    await fill(page, ['a', 'b', 'c', 'd', 'e', 'f']);

    const from = (await page.locator(cells).nth(1).boundingBox())!;
    const to = (await page.locator(cells).nth(4).boundingBox())!;

    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 6, to.y + to.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Delete');

    await expect(page.locator(cells)).toHaveCount(9);

    const rows = await grid(page);

    expect(rows[0][0]).toBe('a');
    expect(rows[0][2]).toBe('');
    expect(rows[1][0]).toBe('');
    expect(rows[1][2]).toBe('f');
  });

  test('the block handle belongs to the whole table; undo removes the table in one step', async ({
    page,
  }) => {
    await insertTable(page);

    const id = await page.locator(table).getAttribute('data-block-id');

    await page.locator(cells).nth(4).hover();
    await expect(page.locator('[data-testid="block-handle"]')).toHaveAttribute('data-block', id!);

    await page.locator(cells).first().locator(editable).click();
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(table)).toHaveCount(0);
  });

  test('the table survives a reload of the document', async ({ page }) => {
    await page.goto('/?lang=en&persist=1');
    await insertTable(page);
    await fill(page, ['a', 'b']);

    await expect
      .poll(() => page.evaluate(() => Object.keys(localStorage).length), { timeout: 10_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(700);
    await page.reload();

    await expect(page.locator(cells)).toHaveCount(9);
    expect((await grid(page))[0]).toEqual(['a', 'b', '']);
  });
});
