import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const columns = '[data-inkbrick-block="columns"]';
const column = '[data-inkbrick-block="column"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function insertColumns(page: Page, query = '/2 col') {
  await page.goto('/?lang=en');
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+End`);
  await page.keyboard.press('Enter');
  await page.keyboard.type(query);
  await page.keyboard.press('Enter');
}

test.describe('Columns', () => {
  test('two columns from the slash menu; typing goes to each; they sit side by side', async ({
    page,
  }) => {
    await insertColumns(page);

    await expect(page.locator(columns)).toHaveCount(1);
    await expect(page.locator(`${columns} ${column}`)).toHaveCount(2);

    await page.keyboard.type('left');
    await page.locator(`${column}:nth-child(2) ${editable}`).first().click();
    await page.keyboard.type('right');

    const boxes = await page.locator(`${columns} ${column}`).evaluateAll((items) =>
      items.map((item) => {
        const { x, y, width } = item.getBoundingClientRect();

        return { x, y, width };
      }),
    );

    expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width * 0.9);
    expect(Math.abs(boxes[1].y - boxes[0].y)).toBeLessThan(2);
    await expect(page.locator(`${column}:nth-child(1) ${editable}`).first()).toHaveText('left');
    await expect(page.locator(`${column}:nth-child(2) ${editable}`).first()).toHaveText('right');
  });

  test('the slash menu has a three column item', async ({ page }) => {
    await insertColumns(page, '/3 col');

    await expect(page.locator(`${columns} ${column}`)).toHaveCount(3);
  });

  test('dragging a divider changes the widths; undo restores them', async ({ page }) => {
    await insertColumns(page);

    const before = await page
      .locator(`${columns} ${column}`)
      .first()
      .evaluate((item) => item.getBoundingClientRect().width);

    await page.locator(columns).hover();

    const handle = (await page.locator('[data-inkbrick-part="divider"]').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 120, y, { steps: 6 });
    await page.mouse.up();

    const after = await page
      .locator(`${columns} ${column}`)
      .first()
      .evaluate((item) => item.getBoundingClientRect().width);

    expect(after).toBeGreaterThan(before + 60);

    await page.locator(`${column} ${editable}`).first().click();
    await page.keyboard.press(`${modifier}+z`);

    const undone = await page
      .locator(`${columns} ${column}`)
      .first()
      .evaluate((item) => item.getBoundingClientRect().width);

    expect(Math.abs(undone - before)).toBeLessThan(2);
  });

  test('Backspace at the start of the second column does not touch the first', async ({ page }) => {
    await insertColumns(page);

    await page.keyboard.type('left');
    await page.locator(`${column}:nth-child(2) ${editable}`).first().click();
    await page.keyboard.type('right');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');

    await expect(page.locator(`${column}:nth-child(1) ${editable}`).first()).toHaveText('left');
    await expect(page.locator(`${column}:nth-child(2) ${editable}`).first()).toHaveText('right');
    await expect(page.locator(`${columns} ${column}`)).toHaveCount(2);
  });

  test('the toolbar adds a column and turns the columns into plain blocks', async ({ page }) => {
    await insertColumns(page);
    await page.keyboard.type('keep me');

    await page.locator(columns).hover();
    await page.getByRole('button', { name: 'Add a column' }).click();
    await expect(page.locator(`${columns} ${column}`)).toHaveCount(3);

    await page.locator(columns).hover();
    await page.getByRole('button', { name: 'Turn the columns into plain blocks' }).click();

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable, { hasText: 'keep me' })).toHaveCount(1);
  });
});
