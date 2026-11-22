import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const handle = '[data-testid="block-handle"]';
const indicator = '[data-testid="drop-indicator"]';
const columns = '[data-inkbrick-block="columns"]';
const column = '[data-inkbrick-block="column"]';
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

/** Тянет блок `from` за ручку и ведёт указатель к краю блока `to`; без `release` линия остаётся на экране. */
async function dragToEdge(
  page: Page,
  from: number,
  to: number,
  edge: 'left' | 'right',
  release = true,
) {
  await page.locator(editable).nth(from).hover();
  await expect(page.locator(handle)).toBeVisible();

  const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
  const target = (await page.locator(editable).nth(to).boundingBox())!;

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 40, grip.y + grip.height / 2 + 12, { steps: 3 });
  await page.mouse.move(
    edge === 'left' ? target.x + 6 : target.x + target.width - 6,
    target.y + target.height / 2,
    { steps: 6 },
  );

  if (release) await page.mouse.up();
}

test.describe('Columns by dragging a block to the edge of another', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['one', 'two', 'three']);
  });

  test('a vertical line shows at the edge; the drop makes two columns; one undo restores', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right', false);

    const line = page.locator(indicator);

    await expect(line).toHaveAttribute('data-side', 'right');
    expect((await line.boundingBox())!.height).toBeGreaterThan(10);

    await page.mouse.up();

    await expect(page.locator(columns)).toHaveCount(1);
    await expect(page.locator(`${columns} ${column}`)).toHaveCount(2);
    await expect(page.locator(`${column}:nth-child(1) ${editable}`)).toHaveText('one');
    await expect(page.locator(`${column}:nth-child(2) ${editable}`)).toHaveText('three');
    await expect(page.locator(editable)).toHaveText(['one', 'three', 'two']);

    await page.keyboard.press(`${modifier}+z`);

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);
  });

  test('the left edge puts the dragged block first', async ({ page }) => {
    await dragToEdge(page, 2, 0, 'left');

    await expect(page.locator(`${column}:nth-child(1) ${editable}`)).toHaveText('three');
    await expect(page.locator(`${column}:nth-child(2) ${editable}`)).toHaveText('one');
  });

  test('dropping at the middle of a block still moves it before or after as usual', async ({
    page,
  }) => {
    await page.locator(editable).nth(2).hover();

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const target = (await page.locator(editable).nth(0).boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 40, grip.y + grip.height / 2 - 12, { steps: 3 });
    await page.mouse.move(target.x + target.width / 2, target.y + 3, { steps: 6 });
    await page.mouse.up();

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['three', 'one', 'two']);
  });

  test('a block dragged out of a column leaves, and the emptied column is removed', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right');
    // Теперь «one | three», затем «two»: тянем «three» к правому краю «two» — колонки разворачиваются.
    await dragToEdge(page, 1, 2, 'right');

    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);
    await expect(page.locator(`${columns} ${column}`)).toHaveCount(2);
    await expect(page.locator(`${columns} ${editable}`)).toHaveText(['two', 'three']);
  });

  test('the handle of the second column stays reachable across the gap and the divider', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right');

    const text = (await page.locator(`${column}:nth-child(2) ${editable}`).boundingBox())!;

    await page.locator(`${column}:nth-child(2) ${editable}`).hover();
    await expect(page.locator(handle)).toBeVisible();

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const y = grip.y + grip.height / 2;

    // Указатель идёт от текста к ручке через промежуток с разделителем: ручка остаётся у второй колонки.
    for (let x = text.x; x >= grip.x + grip.width / 2; x -= 4) await page.mouse.move(x, y);

    expect((await page.locator(handle).boundingBox())!.x).toBeGreaterThan(
      (await page.locator(`${column}:nth-child(1) ${editable}`).boundingBox())!.x +
        (await page.locator(`${column}:nth-child(1) ${editable}`).boundingBox())!.width -
        40,
    );

    await page.mouse.down();
    await page.mouse.move(grip.x + 30, y + 80, { steps: 4 });
    await page.mouse.up();

    // Ручка схватилась: перенос начался, а не потянулся разделитель колонок.
    await expect(page.locator(columns)).toHaveCount(1);
  });

  test('a block moved out of a column by an ordinary drop does not leave an empty column', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right');
    await page.locator(`${column}:nth-child(2) ${editable}`).hover();

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const target = (await page.locator(editable).nth(2)).first();
    const box = (await target.boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 20, grip.y + 40, { steps: 3 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3, { steps: 6 });
    await page.mouse.up();

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);
  });

  test('tables in columns: the handle shows over a table and over the gap, the page stays responsive', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right');
    await page.locator(`${column}:nth-child(2) ${editable}`).click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('/table');
    await page.keyboard.press('Enter');

    const table = page.locator(`${column}:nth-child(2) [data-inkbrick-block="table"]`);
    const box = (await table.boundingBox())!;

    await page.mouse.move(box.x + 20, box.y + 10, { steps: 4 });
    await expect(page.locator(handle)).toBeVisible();

    // Выше таблицы, в пустом месте колонок, и в промежутке: проверка не должна зацикливаться.
    await page.mouse.move(box.x - 16, box.y - 20, { steps: 4 });
    await page.mouse.move(box.x - 16, box.y + 20, { steps: 4 });
    await expect(page.locator(handle)).toBeVisible();
  });
});

test.describe('Picked blocks and columns', () => {
  /** Документ: колонки [a1, a2, a3 | b1], потом абзац c. */
  async function layout(page: Page) {
    await page.goto('/?lang=en');
    await page.evaluate(() => {
      const { editor } = window.__inkbrick!.main;
      const note = editor.document.getBlock(editor.document.rootId)!.children[0];
      const first = editor.document.getBlock(note)!.children[0];
      const ids = [first];

      for (let i = 0; i < 4; i++) {
        ids.push(
          (
            editor.dispatch({
              type: 'insertBlock',
              payload: { flavour: 'block:paragraph', afterId: ids.at(-1)! },
            }) as { blockId: string }
          ).blockId,
        );
      }

      ['a1', 'a2', 'a3', 'b1', 'c'].forEach((text, i) =>
        editor.dispatch({
          type: 'replaceText',
          payload: { blockId: ids[i], from: 0, to: 0, text },
        }),
      );
      editor.dispatch({
        type: 'moveBlockToSide',
        payload: { blockId: ids[3], targetId: ids[0], side: 'right' },
      });
      editor.dispatch({
        type: 'moveBlock',
        payload: { blockId: ids[1], targetId: ids[0], position: 'after' },
      });
      editor.dispatch({
        type: 'moveBlock',
        payload: { blockId: ids[2], targetId: ids[1], position: 'after' },
      });
      editor.clearHistory();
    });
  }

  /** Дерево заметки строкой: `columns[column[a1,a2],column[b1]],c`. */
  const tree = (page: Page) =>
    page.evaluate(() => {
      const { editor } = window.__inkbrick!.main;
      const walk = (id: string): string => {
        const block = editor.document.getBlock(id)!;
        const text = block.content.map((node) => node.insert).join('');
        const kind = block.flavour.replace('block:', '');

        return block.children.length > 0
          ? `${kind}[${block.children.map(walk).join(',')}]`
          : text || kind;
      };
      const note = editor.document.getBlock(editor.document.rootId)!.children[0];

      return editor.document.getBlock(note)!.children.map(walk).join(',');
    });

  const line = (page: Page, text: string) =>
    page.locator(editable).filter({ hasText: new RegExp(`^${text}$`) });

  /** Рамка от поля слева до правого края `to` по высоте блоков `from`…`to`. */
  async function frame(page: Page, from: string, to: string) {
    const top = (await line(page, from).boundingBox())!;
    const bottom = (await line(page, to).boundingBox())!;

    await page.mouse.move(top.x - 80, top.y + 3);
    await page.mouse.down();
    await page.mouse.move(top.x + 20, bottom.y + bottom.height - 3, { steps: 8 });
    await page.mouse.up();
  }

  async function dragGrip(page: Page, from: string, x: number, y: number) {
    await line(page, from).hover();
    await expect(page.locator(handle)).toBeVisible();

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 40, grip.y + 14, { steps: 3 });
    await page.mouse.move(x, y, { steps: 8 });
  }

  test.beforeEach(async ({ page }) => layout(page));

  test('a frame inside one column picks its blocks, not the whole columns block', async ({
    page,
  }) => {
    expect(await tree(page)).toBe('columns[column[a1,a2,a3],column[b1]],c');
    await frame(page, 'a1', 'a3');

    await expect(page.locator('[data-picked]')).toHaveCount(3);
    await expect(page.locator(`${columns}[data-picked]`)).toHaveCount(0);
  });

  test('dragging any picked block of a column moves all of them, in one undo step', async ({
    page,
  }) => {
    await frame(page, 'a1', 'a3');

    const c = (await line(page, 'c').boundingBox())!;

    // За ручку среднего блока — едут все три.
    await dragGrip(page, 'a2', c.x + 40, c.y + c.height - 3);
    await page.mouse.up();

    expect(await tree(page)).toBe('b1,c,a1,a2,a3');

    await page.keyboard.press(`${modifier}+z`);
    expect(await tree(page)).toBe('columns[column[a1,a2,a3],column[b1]],c');
  });

  test('a frame across both columns picks the columns block; dragging a block inside it moves the whole block', async ({
    page,
  }) => {
    const a1 = (await line(page, 'a1').boundingBox())!;
    const b1 = (await line(page, 'b1').boundingBox())!;
    const a3 = (await line(page, 'a3').boundingBox())!;

    // Рамка от поля слева через обе колонки: выбран блок колонок целиком.
    await page.mouse.move(a1.x - 80, a1.y + 3);
    await page.mouse.down();
    await page.mouse.move(b1.x + 20, a3.y + a3.height - 3, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(`${columns}[data-picked]`)).toHaveCount(1);

    const c = (await line(page, 'c').boundingBox())!;

    // За ручку картинки/абзаца в левой колонке — едет весь блок колонок, а не один a1.
    await dragGrip(page, 'a1', c.x + 40, c.y + c.height - 3);
    await page.mouse.up();

    expect(await tree(page)).toBe('c,columns[column[a1,a2,a3],column[b1]]');

    await page.keyboard.press(`${modifier}+z`);
    expect(await tree(page)).toBe('columns[column[a1,a2,a3],column[b1]],c');
  });

  test('picked blocks dropped at the edge of a block go into a column together', async ({
    page,
  }) => {
    await frame(page, 'a1', 'a2');

    const c = (await line(page, 'c').boundingBox())!;

    await dragGrip(page, 'a1', c.x + c.width - 6, c.y + c.height / 2);
    await expect(page.locator(indicator)).toHaveAttribute('data-side', 'right');
    await page.mouse.up();

    expect(await tree(page)).toBe(
      'columns[column[a3],column[b1]],columns[column[c],column[a1,a2]]',
    );

    await page.keyboard.press(`${modifier}+z`);
    expect(await tree(page)).toBe('columns[column[a1,a2,a3],column[b1]],c');
  });
});
