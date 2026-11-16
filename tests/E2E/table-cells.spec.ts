import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function insertTable(page: Page) {
  await page.locator(editable).first().click();
  await page.keyboard.type('before');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      await page.keyboard.type(`r${r}c${c}`);
      if (r < 2 || c < 2) await page.keyboard.press('Tab');
    }
  }
}

const grid = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-inkbrick-block="table"] tr')].map((row) =>
      [...row.querySelectorAll('td .editable')].map((cell) => cell.textContent),
    ),
  );

async function dragCells(page: Page, from: number, to: number) {
  const a = (await page.locator(cells).nth(from).boundingBox())!;
  const b = (await page.locator(cells).nth(to).boundingBox())!;

  await page.mouse.move(a.x + 6, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test.describe('Table cell selection', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);
  });

  test('dragging across cells selects a rectangle; Delete clears it, undo brings it back', async ({
    page,
  }) => {
    await dragCells(page, 0, 4);

    await expect(page.locator(`${cells}[data-cell-selected]`)).toHaveCount(4);

    await page.keyboard.press('Delete');
    expect((await grid(page)).slice(0, 2).map((row) => row.slice(0, 2))).toEqual([
      ['', ''],
      ['', ''],
    ]);
    expect((await grid(page))[0][2]).toBe('r0c2');

    await page.keyboard.press(`${modifier}+z`);
    expect((await grid(page))[1]).toEqual(['r1c0', 'r1c1', 'r1c2']);
  });

  test('a selected rectangle can be copied and pasted as a table', async ({ page }) => {
    await dragCells(page, 0, 4);
    await page.keyboard.press(`${modifier}+c`);

    await page.locator(cells).nth(8).locator(editable).click();
    await page.keyboard.press(`${modifier}+v`);

    const rows = await grid(page);

    expect(rows[2][2]).toBe('r0c0');
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  test('Escape and typing return the caret to a cell', async ({ page }) => {
    await dragCells(page, 3, 5);
    await expect(page.locator(`${cells}[data-cell-selected]`)).toHaveCount(3);

    await page.keyboard.press('Escape');
    await expect(page.locator(`${cells}[data-cell-selected]`)).toHaveCount(0);

    await page.keyboard.type('!');
    expect((await grid(page))[1].some((cell) => cell?.includes('!'))).toBe(true);
  });

  test('"Select row" in the row menu selects the whole row', async ({ page }) => {
    const box = (await page.locator(cells).nth(4).boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page
      .locator('[data-inkbrick-ui="table-controls"][data-inkbrick-part="row-grip"]')
      .click();
    await page.getByRole('menuitem', { name: 'Select row' }).click();

    await expect(page.locator(`${cells}[data-cell-selected]`)).toHaveCount(3);
  });
});

test.describe('Merged table cells', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);
  });

  test('merge from the right-click menu, type in the merged cell, split again', async ({
    page,
  }) => {
    const before = (await page.locator(cells).nth(0).boundingBox())!;

    await dragCells(page, 0, 4);

    const target = (await page.locator(cells).nth(4).boundingBox())!;

    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2, {
      button: 'right',
    });
    await page.getByRole('menuitem', { name: 'Merge cells' }).click();

    const merged = (await page.locator(cells).nth(0).boundingBox())!;

    expect(merged.width).toBeGreaterThan(before.width * 1.8);
    expect(merged.height).toBeGreaterThan(before.height * 1.8);
    await expect(page.locator(`${cells}:visible`)).toHaveCount(6);

    await page.locator(cells).nth(0).locator(editable).click();
    await page.keyboard.type('!');
    expect((await grid(page))[0][0]).toContain('!');

    await page.locator(cells).nth(0).locator(editable).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Split cell' }).click();

    await expect(page.locator(`${cells}:visible`)).toHaveCount(9);
  });

  test('Tab goes past the merged cell and undo takes the merge back', async ({ page }) => {
    await dragCells(page, 1, 2);

    const target = (await page.locator(cells).nth(2).boundingBox())!;

    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2, {
      button: 'right',
    });
    await page.getByRole('menuitem', { name: 'Merge cells' }).click();
    await expect(page.locator(`${cells}:visible`)).toHaveCount(8);

    await page.locator(cells).nth(0).locator(editable).click();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('X');

    expect((await grid(page))[1].some((cell) => cell?.includes('X'))).toBe(true);

    await page.keyboard.press(`${modifier}+z`);
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(`${cells}:visible`)).toHaveCount(9);
  });
});
