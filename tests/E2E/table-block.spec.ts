import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const handle = '[data-testid="block-handle"]';
const part = (name: string) => `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${name}"]`;
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

/** Таблица 2×2 после текущего блока, ячейки подписаны `<prefix><строка><столбец>`. */
async function addTable(page: Page, prefix: string) {
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      await page.keyboard.type(`${prefix}${r}${c}`);
      if (r < 2 || c < 2) await page.keyboard.press('Tab');
    }
  }
}

const cellsOf = (page: Page, index: number) => page.locator(table).nth(index).locator('td');

async function dragCells(page: Page, tableIndex: number, from: number, to: number) {
  const a = (await cellsOf(page, tableIndex).nth(from).boundingBox())!;
  const b = (await cellsOf(page, tableIndex).nth(to).boundingBox())!;

  await page.mouse.move(a.x + 6, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** Тянет таблицу за ручку блока и отпускает в точке `[x, y]`. */
async function dragTable(page: Page, tableIndex: number, to: [number, number]) {
  const cell = (await cellsOf(page, tableIndex).first().boundingBox())!;

  await page.mouse.move(cell.x + 10, cell.y + cell.height / 2);
  await expect(page.locator(handle)).toBeVisible();

  const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 40, grip.y + 30, { steps: 3 });
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
}

test.describe('A table as a block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('dragging a table with selected cells moves it and keeps the same cells selected', async ({
    page,
  }) => {
    await typeBlocks(page, ['one', 'two']);
    await addTable(page, 't');
    await page.mouse.move(2, 2);

    await dragCells(page, 0, 0, 4);
    await expect(page.locator('[data-cell-selected]')).toHaveCount(4);

    // Подсветка текста браузера не задевает ячейку вне прямоугольника (t02): видно только выделение ячеек.
    const highlight = await cellsOf(page, 0)
      .nth(2)
      .locator(editable)
      .evaluate((node) => getComputedStyle(node, '::selection').backgroundColor);

    expect(highlight).toBe('rgba(0, 0, 0, 0)');

    const one = (await page.locator(editable, { hasText: /^one$/ }).boundingBox())!;

    await dragTable(page, 0, [one.x + one.width / 2, one.y + 3]);

    // Та же таблица, те же ячейки: выделение остаётся, как и курсор при переносе блока.
    await expect(page.locator('[data-cell-selected]')).toHaveCount(4);
    await expect(cellsOf(page, 0).nth(4).locator(editable)).toHaveText('t11');
    await expect(cellsOf(page, 0).nth(4)).toHaveAttribute('data-cell-selected', 'true');

    // Таблица теперь первая, её ячейки на месте.
    const order = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-inkbrick-block="note"] > * [data-inkbrick-block], [data-inkbrick-block="note"] > [data-inkbrick-block]',
        ),
      ]
        .filter((node) =>
          ['table', 'paragraph'].includes(node.getAttribute('data-inkbrick-block')!),
        )
        .filter((node) => !node.parentElement?.closest('[data-inkbrick-block="table"]'))
        .map((node) =>
          node.getAttribute('data-inkbrick-block') === 'table' ? 'table' : node.textContent,
        ),
    );

    expect(order.indexOf('table')).toBeLessThan(order.indexOf('one'));
    await expect(cellsOf(page, 0).first().locator(editable)).toHaveText('t00');
  });

  test('two tables side by side in columns keep their own controls, selection and menus', async ({
    page,
  }) => {
    await typeBlocks(page, ['one']);
    await addTable(page, 'a');
    await page.locator(editable, { hasText: /^one$/ }).click();
    await page.keyboard.press('End');
    await addTable(page, 'b');
    await page.mouse.move(2, 2);

    // Вторая таблица (вставлена выше) — к правому краю первой ячейки другой таблицы... проще через движок.
    await page.evaluate(() => {
      const { editor } = (
        window as never as {
          __inkbrick: {
            main: {
              editor: {
                document: {
                  rootId: string;
                  getBlock: (id: string) => { flavour: string; id: string; children: string[] };
                };
                dispatch: (intent: unknown) => unknown;
              };
            };
          };
        }
      ).__inkbrick.main;
      const tables: string[] = [];
      const walk = (id: string) => {
        const block = editor.document.getBlock(id);

        if (!block) return;
        if (block.flavour === 'block:table') tables.push(block.id);
        else block.children.forEach(walk);
      };

      walk(editor.document.rootId);
      editor.dispatch({
        type: 'moveBlockToSide',
        payload: { blockId: tables[1], targetId: tables[0], side: 'right' },
      });
    });

    const columns = '[data-inkbrick-block="columns"]';

    await expect(page.locator(`${columns} ${table}`)).toHaveCount(2);

    const left = page.locator(`${columns} [data-inkbrick-block="column"]:nth-child(1) ${table}`);
    const right = page.locator(`${columns} [data-inkbrick-block="column"]:nth-child(2) ${table}`);
    const leftCells = left.locator('td');
    const rightCells = right.locator('td');
    const leftFirst = await leftCells.first().locator(editable).textContent();
    const rightFirst = await rightCells.first().locator(editable).textContent();

    expect(leftFirst).not.toBe(rightFirst);

    // Выделение в левой таблице, затем клик в правую — левое выделение снимается.
    const a = (await leftCells.nth(0).boundingBox())!;
    const b = (await leftCells.nth(4).boundingBox())!;

    await page.mouse.move(a.x + 6, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(left.locator('[data-cell-selected]')).toHaveCount(4);

    await rightCells.nth(4).locator(editable).click();
    await expect(page.locator('[data-cell-selected]')).toHaveCount(0);

    // Ручки — только у таблицы под указателем, и в её границах.
    const box = (await rightCells.nth(4).boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const grip = page.locator(part('row-grip'));

    await expect(grip).toHaveCount(1);

    const gripBox = (await grip.boundingBox())!;
    const rightBox = (await right.boundingBox())!;

    expect(gripBox.x).toBeGreaterThan(rightBox.x - 40);

    // «Удалить строку» из меню правой таблицы не трогает левую.
    await grip.click();
    await page.getByRole('menuitem', { name: 'Delete row' }).click();

    await expect(right.locator('tr')).toHaveCount(2);
    await expect(left.locator('tr')).toHaveCount(3);
  });

  test('a table under a folded heading hides with its controls and comes back whole', async ({
    page,
  }) => {
    await typeBlocks(page, ['# Section']);
    await addTable(page, 't');
    await page.keyboard.press(`${modifier}+End`);
    await page.mouse.move(2, 2);

    const heading = page.locator('[data-inkbrick-block="heading"]', { hasText: 'Section' });

    await heading.hover();
    await heading.locator('[data-inkbrick-part="fold"]').click();

    await expect(page.locator(table)).toHaveCount(0);
    await expect(page.locator(part('row-grip'))).toHaveCount(0);
    await expect(page.locator(part('column-grip'))).toHaveCount(0);

    await heading.locator('[data-inkbrick-part="fold"]').click();
    await expect(page.locator(table)).toHaveCount(1);
    await expect(cellsOf(page, 0).nth(8).locator(editable)).toHaveText('t22');
  });
});

test.describe('Reaching the handle of a table inside columns', () => {
  /** Две таблицы рядом в колонках и абзац под ними. */
  async function sideBySide(page: Page) {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['one']);
    await addTable(page, 'a');
    await page.locator(editable, { hasText: /^one$/ }).click();
    await page.keyboard.press('End');
    await addTable(page, 'b');
    await page.keyboard.press(`${modifier}+End`);
    await page.keyboard.press('Enter');
    await page.keyboard.type('below');
    await page.evaluate(() => {
      const { editor } = (
        window as never as {
          __inkbrick: {
            main: {
              editor: {
                document: {
                  rootId: string;
                  getBlock: (id: string) => { flavour: string; id: string; children: string[] };
                };
                dispatch: (intent: unknown) => unknown;
              };
            };
          };
        }
      ).__inkbrick.main;
      const tables: string[] = [];
      const walk = (id: string) => {
        const block = editor.document.getBlock(id);

        if (!block) return;
        if (block.flavour === 'block:table') tables.push(block.id);
        else block.children.forEach(walk);
      };

      walk(editor.document.rootId);
      editor.dispatch({
        type: 'moveBlockToSide',
        payload: { blockId: tables[1], targetId: tables[0], side: 'right' },
      });
    });
    await page.mouse.move(2, 2);
  }

  const column = (n: number) =>
    `[data-inkbrick-block="columns"] [data-inkbrick-block="column"]:nth-child(${n})`;

  for (const side of [1, 2]) {
    test(`the handle of the ${side === 1 ? 'left' : 'right'} table stays while the pointer goes to it, and drags the table out`, async ({
      page,
    }) => {
      await sideBySide(page);

      const target = page.locator(`${column(side)} ${table}`);
      const firstCell = (await target.locator('td').first().boundingBox())!;
      const y = firstCell.y + 8;

      // Наведение на первую ячейку: ручка таблицы появляется.
      await page.mouse.move(firstCell.x + firstCell.width / 2, y, { steps: 4 });
      await expect(page.locator(handle)).toBeVisible();
      // Ручка появляется плавно (сдвиг на несколько пикселей): меряем, когда она встала.
      await page.waitForTimeout(400);

      const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;

      // Указатель медленно идёт к ручке по горизонтали: ручка не переезжает (к соседней таблице или к колонкам).
      for (let x = firstCell.x + 10; x >= grip.x + grip.width / 2; x -= 3) {
        await page.mouse.move(x, grip.y + grip.height / 2);
        const now = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;

        expect(Math.abs(now.x - grip.x)).toBeLessThan(2);
      }

      // Хватаем и уносим под абзац «below»: таблица выходит из колонок, колонки разворачиваются.
      const below = (await page.locator(editable, { hasText: /^below$/ }).boundingBox())!;

      await page.mouse.down();
      await page.mouse.move(grip.x + 30, grip.y + 40, { steps: 4 });
      await page.mouse.move(below.x + below.width / 2, below.y + below.height - 3, { steps: 8 });
      await page.mouse.up();

      await expect(page.locator('[data-inkbrick-block="columns"]')).toHaveCount(0);
      await expect(page.locator(table)).toHaveCount(2);
    });
  }
});
