import { test, expect, type Locator, type Page } from '@playwright/test';

const editable = '.editable';
const handle = '[data-testid="block-handle"]';
const columns = '[data-inkbrick-block="columns"]';
const column = '[data-inkbrick-block="column"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const block = (page: Page, text: string) =>
  page.locator(editable).filter({ hasText: new RegExp(`^${text}$`) });

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

/** Берёт блок за ручку (наведение на `grab`) и отпускает в точке, которую даёт `drop` по рамке цели. */
async function drag(
  page: Page,
  grab: Locator,
  target: Locator,
  drop: (box: { x: number; y: number; width: number; height: number }) => [number, number],
) {
  await grab.hover();
  await expect(page.locator(handle)).toBeVisible();

  const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
  const box = (await target.boundingBox())!;
  const [x, y] = drop(box);

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 40, grip.y + grip.height / 2 + 12, { steps: 3 });
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

const toRight = (page: Page, from: string, to: string) =>
  drag(page, block(page, from), block(page, to), (b) => [b.x + b.width - 6, b.y + b.height / 2]);
const toLeft = (page: Page, from: string, to: string) =>
  drag(page, block(page, from), block(page, to), (b) => [b.x + 6, b.y + b.height / 2]);
/** Обычный перенос: под блок `to` (нижняя кромка, по центру — не к краю). */
const below = (page: Page, from: string, to: string) =>
  drag(page, block(page, from), block(page, to), (b) => [b.x + b.width / 2, b.y + b.height - 3]);

async function expectColumns(page: Page, layout: string[][]) {
  await expect(page.locator(`${columns} > [data-inkbrick-part="grid"] > ${column}`)).toHaveCount(
    layout.length,
  );

  for (const [i, texts] of layout.entries()) {
    await expect(page.locator(`${column}:nth-child(${i + 1}) ${editable}`)).toHaveText(texts);
  }
}

test.describe('Dragging blocks into columns and back', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('a block goes into columns and comes back; undo and redo walk the way', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three']);

    await toRight(page, 'three', 'one');
    await expectColumns(page, [['one'], ['three']]);

    await below(page, 'three', 'two');
    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);

    await page.keyboard.press(`${modifier}+z`);
    await expectColumns(page, [['one'], ['three']]);
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);

    await page.keyboard.press(`${modifier}+Shift+z`);
    await expectColumns(page, [['one'], ['three']]);
  });

  test('the left block of two leaves the columns, the other one unwraps', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three']);

    await toRight(page, 'two', 'one');
    await below(page, 'one', 'three');

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['two', 'three', 'one']);
  });

  test('three columns shrink to two, then unwrap as blocks are dragged out', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three', 'four']);

    await toRight(page, 'two', 'one');
    await toRight(page, 'three', 'two');
    await expectColumns(page, [['one'], ['two'], ['three']]);

    await below(page, 'two', 'four');
    await expectColumns(page, [['one'], ['three']]);
    await expect(page.locator(editable)).toHaveText(['one', 'three', 'four', 'two']);

    await below(page, 'three', 'four');
    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'four', 'three', 'two']);
  });

  test('a block dragged from one column under a block of another column', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three']);

    await toRight(page, 'two', 'one');
    await toRight(page, 'three', 'two');
    await below(page, 'three', 'one');

    await expectColumns(page, [['one', 'three'], ['two']]);

    // И обратно — к правому краю «two»: колонка снова своя.
    await toRight(page, 'three', 'two');
    await expectColumns(page, [['one'], ['two'], ['three']]);
  });

  test('a block changes sides inside the same columns', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three']);

    await toRight(page, 'two', 'one');
    await toLeft(page, 'two', 'one');

    await expectColumns(page, [['two'], ['one']]);
    await expect(page.locator(editable)).toHaveText(['two', 'one', 'three']);
  });

  test('a table goes into columns and comes back', async ({ page }) => {
    await typeBlocks(page, ['one', 'two']);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/table');
    await page.keyboard.press('Enter');

    const table = page.locator('[data-inkbrick-block="table"]');
    const cell = page.locator('[data-inkbrick-block="table-cell"]').first();

    await expect(table).toHaveCount(1);

    await drag(page, cell, block(page, 'one'), (b) => [b.x + b.width - 6, b.y + b.height / 2]);
    await expect(page.locator(`${column}:nth-child(2) [data-inkbrick-block="table"]`)).toHaveCount(
      1,
    );

    await drag(page, cell, block(page, 'two'), (b) => [b.x + b.width / 2, b.y + b.height - 3]);
    await expect(page.locator(columns)).toHaveCount(0);
    await expect(table).toHaveCount(1);
    await expect(page.locator(editable).filter({ hasText: /^(one|two)$/ })).toHaveText([
      'one',
      'two',
    ]);
  });
});
