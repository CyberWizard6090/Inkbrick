import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const part = (name: string) => `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${name}"]`;

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

/** Команда таблицы через редактор песочницы (как из меню, но без поиска пунктов). */
async function tableCommand(page: Page, type: string, payload: Record<string, unknown>) {
  await page.evaluate(
    ({ type, payload }) => {
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
      let found = '';
      const walk = (id: string) => {
        const block = editor.document.getBlock(id);

        if (!block || found) return;
        if (block.flavour === 'block:table') found = block.id;
        block.children.forEach(walk);
      };

      walk(editor.document.rootId);
      editor.dispatch({ type, payload: { blockId: found, ...payload } });
    },
    { type, payload },
  );
}

/** Видимые ячейки по строкам: скрытые объединением в DOM есть, но не показываются. */
const grid = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-inkbrick-block="table"] tr')].map((row) =>
      [...row.querySelectorAll('td')]
        .filter((cell) => (cell as HTMLElement).offsetParent !== null)
        .map((cell) => cell.querySelector('.editable')?.textContent ?? ''),
    ),
  );

/** Текст ячейки, где сейчас каретка. */
const caretCell = (page: Page) =>
  page.evaluate(() => {
    const node = getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;

    return element?.closest('.editable')?.textContent ?? null;
  });

async function hover(page: Page, index: number) {
  const box = (await page.locator(`${cells}:visible`).nth(index).boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe('Merged cells at the edges', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await tableCommand(page, 'mergeTableCells', {
      range: { top: 0, left: 0, bottom: 1, right: 1 },
    });
    await page.mouse.move(2, 2);
    await expect(page.locator(`${cells}:visible`)).toHaveCount(6);
  });

  test('arrows and Tab walk around the merged cell and into it, in reading order', async ({
    page,
  }) => {
    // Из нижнего ряда вверх — в объединённую ячейку.
    await page.locator(`${cells}:visible`).nth(3).locator(editable).click();
    await expect.poll(() => caretCell(page)).toBe('r2c0');

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => caretCell(page)).toContain('r0c0');

    // Влево из соседней ячейки — в конец объединённой; вправо из её конца — обратно.
    await page.locator(`${cells}:visible`).nth(1).locator(editable).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => caretCell(page)).toContain('r1c1');

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => caretCell(page)).toBe('r0c2');

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => caretCell(page)).toBe('r1c2');

    // Tab и Shift+Tab идут по видимым ячейкам в порядке чтения: объединённая — одна, в первой строке.
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => caretCell(page)).toBe('r0c2');

    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => caretCell(page)).toContain('r0c0');

    await page.keyboard.press('Tab');
    await expect.poll(() => caretCell(page)).toBe('r0c2');

    await page.keyboard.press('Tab');
    await expect.poll(() => caretCell(page)).toBe('r1c2');

    await page.keyboard.press('Tab');
    await expect.poll(() => caretCell(page)).toBe('r2c0');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');

    await page.keyboard.type('!');
    expect((await grid(page))[0][1]).toBe('r0c2!');
  });

  test('the row and column menus do not offer moving or sorting while there are merges', async ({
    page,
  }) => {
    await hover(page, 4);
    await page.locator(part('row-grip')).click();

    const menu = page.locator('[data-inkbrick-ui="block-menu"]');

    await expect(menu).toBeVisible();
    for (const name of ['Move row up', 'Move row down'])
      await expect(menu.getByRole('menuitem', { name })).toBeDisabled();
    await page.keyboard.press('Escape');

    await hover(page, 5);
    await page.locator(part('column-grip')).click();
    await expect(menu).toBeVisible();
    for (const name of ['Sort ascending', 'Sort descending'])
      await expect(menu.getByRole('menuitem', { name })).toBeDisabled();
    await page.keyboard.press('Escape');

    // Без объединений те же пункты снова доступны.
    await tableCommand(page, 'splitTableCell', { row: 0, column: 0 });
    await page.mouse.move(2, 2);
    await hover(page, 4);
    await page.locator(part('row-grip')).click();
    await expect(menu.getByRole('menuitem', { name: 'Move row up' })).toBeEnabled();
  });

  test('deleting the first row of the merge from the row menu keeps the merged text', async ({
    page,
  }) => {
    await hover(page, 0);
    await page.locator(part('row-grip')).click();
    await page.getByRole('menuitem', { name: 'Delete row' }).click();

    const rows = await grid(page);

    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toContain('r0c0');
    expect(rows[0][0]).toContain('r1c1');
    expect(rows[1]).toEqual(['r2c0', 'r2c1', 'r2c2']);
  });
});
