import { test, expect, type Locator, type Page } from '@playwright/test';

const editable = '.editable';
const handle = '[data-testid="block-handle"]';
const indicator = '[data-testid="drop-indicator"]';
const picked = '[data-picked]';
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
  release = true,
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

  if (release) await page.mouse.up();
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

  test('Escape in the middle of a drag to the side leaves everything as it was', async ({
    page,
  }) => {
    await typeBlocks(page, ['one', 'two', 'three']);
    await drag(
      page,
      block(page, 'three'),
      block(page, 'one'),
      (b) => [b.x + b.width - 6, b.y + b.height / 2],
      false,
    );
    await expect(page.locator(indicator)).toHaveAttribute('data-side', 'right');

    await page.keyboard.press('Escape');
    await expect(page.locator(indicator)).toHaveCount(0);
    await page.mouse.up();

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);

    // Курсор остался, где был: набор идёт в «three».
    await page.keyboard.type('!');
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three!']);
  });

  test('Escape while dragging a block out of the columns keeps it in its column', async ({
    page,
  }) => {
    await typeBlocks(page, ['one', 'two', 'three']);
    await toRight(page, 'two', 'one');
    await drag(
      page,
      block(page, 'two'),
      block(page, 'three'),
      (b) => [b.x + b.width / 2, b.y + b.height - 3],
      false,
    );
    await page.keyboard.press('Escape');
    await page.mouse.up();

    await expectColumns(page, [['one'], ['two']]);
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);
  });

  test('six columns at most: a seventh block shows no side line and drops as a plain move', async ({
    page,
  }) => {
    const names = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

    await typeBlocks(page, names);

    for (let i = 1; i < 6; i++) await toRight(page, names[i], names[i - 1]);
    await expectColumns(page, [['c1'], ['c2'], ['c3'], ['c4'], ['c5'], ['c6']]);

    await drag(
      page,
      block(page, 'c7'),
      block(page, 'c6'),
      (b) => [b.x + b.width - 4, b.y + b.height / 2],
      false,
    );
    // К краю нельзя: вертикальной линии нет (если линия есть — она обычная, без стороны).
    await expect(page.locator(`${indicator}[data-side]`)).toHaveCount(0);
    await page.mouse.up();

    await expect(page.locator(`${columns} > [data-inkbrick-part="grid"] > ${column}`)).toHaveCount(
      6,
    );
    await expect(page.locator(editable)).toHaveText(names);
  });

  test('picked blocks of a column leave together, and the emptied column goes', async ({
    page,
  }) => {
    await typeBlocks(page, ['one', 'two', 'three', 'four']);
    await toRight(page, 'two', 'one');
    await below(page, 'three', 'one');
    await expectColumns(page, [['one', 'three'], ['two']]);

    // Выбираем оба блока левой колонки и уносим их под «four» одним переносом.
    await block(page, 'one').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator(picked)).toHaveCount(2);

    await below(page, 'one', 'four');

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['two', 'four', 'one', 'three']);

    // Один шаг отмены возвращает обе колонки.
    await page.keyboard.press(`${modifier}+z`);
    await expectColumns(page, [['one', 'three'], ['two']]);
  });

  test('picked blocks go into a column and come back in order', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three', 'four']);
    await toRight(page, 'two', 'one');

    await block(page, 'three').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator(picked)).toHaveCount(2);

    await below(page, 'three', 'two');
    await expectColumns(page, [['one'], ['two', 'three', 'four']]);

    await block(page, 'three').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');
    await below(page, 'three', 'one');
    await expectColumns(page, [['one', 'three', 'four'], ['two']]);
  });

  test('the caret stays in its block when that block is dragged into columns and back', async ({
    page,
  }) => {
    await typeBlocks(page, ['one', 'two', 'three']);

    await toRight(page, 'three', 'one');
    await page.keyboard.type('!');
    await expect(page.locator(`${column}:nth-child(2) ${editable}`)).toHaveText('three!');

    await below(page, 'three!', 'two');
    await page.keyboard.type('?');
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three!?']);
  });
});

test.describe('The handle of a block in a later column', () => {
  test('is the full handle and fits the gap between the columns, off the left column, and still drags', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['one', 'two', 'three']);
    await toRight(page, 'two', 'one');

    const left = page.locator(`${column}:nth-child(1)`);
    const right = page.locator(`${column}:nth-child(2)`);

    await block(page, 'two').hover();
    await expect(page.locator(handle)).toBeVisible();
    await page.waitForTimeout(300);

    const box = (await page.locator(handle).boundingBox())!;
    const leftBox = (await left.boundingBox())!;
    const rightBox = (await right.boundingBox())!;

    // Полная ручка («+» и «⠿») помещается в промежуток между колонками.
    await expect(page.locator(`${handle} [data-action="add"]`)).toHaveCount(1);
    expect(box.x).toBeGreaterThanOrEqual(leftBox.x + leftBox.width);
    expect(box.x + box.width).toBeLessThanOrEqual(rightBox.x);

    // Разделитель колонок — левее ручки, они не перекрываются: его можно тянуть на любой высоте.
    const divider = (await page.locator('[data-inkbrick-part="divider"]').boundingBox())!;

    expect(divider.x + divider.width).toBeLessThanOrEqual(box.x);
    expect(divider.x).toBeGreaterThanOrEqual(leftBox.x + leftBox.width);

    // «⠿» правой колонки по-прежнему переносит блок.
    await below(page, 'two', 'three');
    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'three', 'two']);
  });

  test('a code block in the left column is not covered by the handle of the right one', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['one', 'two']);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');
    await page.keyboard.type('const value = "a long line of code that fills the column";');

    const code = page.locator('[data-inkbrick-block="code"]');

    await drag(page, code, block(page, 'one'), (b) => [b.x + 6, b.y + b.height / 2]);
    await expect(page.locator(`${column}:nth-child(1) [data-inkbrick-block="code"]`)).toHaveCount(
      1,
    );

    await block(page, 'one').hover();
    await page.waitForTimeout(300);

    const handleBox = (await page.locator(handle).boundingBox())!;
    const codeBox = (await code.boundingBox())!;

    expect(handleBox.x).toBeGreaterThanOrEqual(codeBox.x + codeBox.width);
  });
});
