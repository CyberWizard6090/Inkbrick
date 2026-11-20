import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const part = (name: string) => `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${name}"]`;
const menu = '[data-testid="block-menu"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Абзац и под ним таблица 3×3 из slash-меню, заполненная «r<строка>c<столбец>». */
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

async function hover(page: Page, row: number, column: number) {
  const columns = await page.locator(`${table} tr`).first().locator('td').count();
  const box = (await page
    .locator(cells)
    .nth(row * columns + column)
    .boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe('Table menus and the scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    // Страница длиннее окна: ниже таблицы столько абзацев, что её можно прокручивать.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Control+End');
      await page.keyboard.press('Enter');
      await page.keyboard.type(`line ${i}`);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(2, 2);
  });

  test('the column menu closes when the page scrolls, and does not when its own list scrolls', async ({
    page,
  }) => {
    await hover(page, 1, 1);
    await page.locator(part('column-grip')).click();

    const menu = page.locator('[data-inkbrick-ui="block-menu"]');

    await expect(menu).toBeVisible();

    // Прокрутка самого меню (оно длиннее окна на низком экране) его не закрывает.
    await menu.evaluate((element) =>
      element.dispatchEvent(new Event('scroll', { bubbles: false })),
    );
    await expect(menu).toBeVisible();

    await page.mouse.wheel(0, 600);
    await expect(menu).toHaveCount(0);
  });
});

test.describe('Table controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);
  });

  test('hovering a cell shows the strips of its row and column and the add buttons', async ({
    page,
  }) => {
    await page.keyboard.press('Escape');
    await page.locator('.playground-header').click();
    await expect(page.locator(part('row-grip'))).toHaveCount(0);

    await hover(page, 1, 2);

    await expect(page.locator(part('row-grip'))).toHaveAttribute('aria-label', /Row 2/);
    await expect(page.locator(part('column-grip'))).toHaveAttribute('aria-label', /Column 3/);
    await expect(page.locator(part('row-insert'))).toHaveCount(2);
    await expect(page.locator(part('column-insert'))).toHaveCount(2);

    await page.mouse.move(2, 2);
    await expect(page.locator(part('row-grip'))).toHaveCount(0);
  });

  test('the strips can be reached with the mouse: they stay while the pointer travels to them', async ({
    page,
  }) => {
    await hover(page, 1, 1);

    const grip = (await page.locator(part('row-grip')).boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 6 });

    await expect(page.locator(part('row-grip'))).toBeVisible();
    await page.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await expect(page.locator(menu)).toBeVisible();
  });

  test('the markers on the boundaries grow the table; undo takes each back in one step', async ({
    page,
  }) => {
    await hover(page, 2, 2);
    await page.locator(part('row-insert')).nth(1).click();
    expect(await grid(page)).toHaveLength(4);

    await hover(page, 0, 0);
    await page.locator(part('column-insert')).nth(1).click();
    expect((await grid(page))[0]).toHaveLength(4);

    await page.keyboard.press(`${modifier}+z`);
    expect((await grid(page))[0]).toHaveLength(3);
    await page.keyboard.press(`${modifier}+z`);
    expect(await grid(page)).toHaveLength(3);
  });

  test('the row menu inserts, moves, toggles the header and deletes', async ({ page }) => {
    await hover(page, 1, 0);
    await page.locator(part('row-grip')).click();
    await page.getByRole('menuitem', { name: 'Insert row above' }).click();
    expect((await grid(page)).map((row) => row[0])).toEqual(['r0c0', '', 'r1c0', 'r2c0']);

    await hover(page, 2, 0);
    await page.locator(part('row-grip')).click();
    await page.getByRole('menuitem', { name: 'Move row down' }).click();
    expect((await grid(page)).map((row) => row[0])).toEqual(['r0c0', '', 'r2c0', 'r1c0']);

    await hover(page, 0, 0);
    await page.locator(part('row-grip')).click();
    await page.getByRole('menuitem', { name: 'Make first row a regular row' }).click();
    await expect(page.locator(table)).not.toHaveAttribute('data-header', /.*/);

    await hover(page, 1, 0);
    await page.locator(part('row-grip')).click();
    await page.getByRole('menuitem', { name: 'Delete row' }).click();
    expect((await grid(page)).map((row) => row[0])).toEqual(['r0c0', 'r2c0', 'r1c0']);
  });

  test('the column menu inserts, aligns and deletes', async ({ page }) => {
    await hover(page, 0, 1);
    await page.locator(part('column-grip')).click();
    await page.getByRole('menuitem', { name: 'Insert column right' }).click();
    expect((await grid(page))[0]).toEqual(['r0c0', 'r0c1', '', 'r0c2']);

    await hover(page, 1, 0);
    await page.locator(part('column-grip')).click();
    await page.getByRole('menuitem', { name: 'Align column center' }).click();
    await expect(page.locator(cells).nth(0)).toHaveAttribute('data-align', 'center');
    await expect(page.locator(cells).nth(8)).toHaveAttribute('data-align', 'center');
    await expect(page.locator(cells).nth(1)).toHaveAttribute('data-align', 'left');

    await hover(page, 0, 2);
    await page.locator(part('column-grip')).click();
    await page.getByRole('menuitem', { name: 'Delete column' }).click();
    expect((await grid(page))[0]).toEqual(['r0c0', 'r0c1', 'r0c2']);
  });

  test('the menu closes with Escape and a click outside, and typing continues in the table', async ({
    page,
  }) => {
    await hover(page, 1, 1);
    await page.locator(part('row-grip')).click();
    await expect(page.locator(menu)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(menu)).toHaveCount(0);

    // Каретка вернулась в документ: набор продолжается в той ячейке, где она стояла.
    await page.keyboard.type('Z');
    expect((await grid(page))[2][2]).toBe('r2c2Z');

    await hover(page, 1, 1);
    await page.locator(part('column-grip')).click();
    await page.mouse.click(5, 300);
    await expect(page.locator(menu)).toHaveCount(0);

    await page.locator(cells).nth(4).locator(editable).click();
    await page.keyboard.type('!');
    expect((await grid(page))[1][1]).toContain('!');
  });

  test('dragging a column border resizes the column live and undo restores it', async ({
    page,
  }) => {
    await hover(page, 0, 0);

    const before = (await page.locator(cells).nth(0).boundingBox())!;
    const handle = (await page.locator(part('resize')).nth(0).boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y, { steps: 6 });

    const during = (await page.locator(cells).nth(0).boundingBox())!;

    expect(during.width).toBeGreaterThan(before.width + 40);

    await page.mouse.up();

    const after = (await page.locator(cells).nth(0).boundingBox())!;

    expect(Math.abs(after.width - during.width)).toBeLessThan(2);
    await expect(page.locator(`${table} col`).first()).toHaveAttribute('style', /width/);

    await page.locator(cells).nth(0).locator(editable).click();
    await page.keyboard.press(`${modifier}+z`);

    const undone = (await page.locator(cells).nth(0).boundingBox())!;

    expect(Math.abs(undone.width - before.width)).toBeLessThan(2);
  });

  test('the block handle is the same as of other blocks, in the same column, and overlaps no control', async ({
    page,
  }) => {
    // Первая строка и первый столбец: у них маркеры вставки лежат ближе всего к углу.
    await hover(page, 0, 0);

    const handle = page.locator('[data-testid="block-handle"]');

    await expect(handle).toHaveCount(1);
    // Как у всех блоков: «+» и хваталка.
    await expect(handle.locator('[data-action="add"]')).toHaveCount(1);

    await page.waitForTimeout(300);

    const tab = (await handle.boundingBox())!;
    const table = (await page.locator('[data-inkbrick-block="table"]').boundingBox())!;

    // Ручка левее таблицы, с зазором.
    expect(tab.x + tab.width).toBeLessThan(table.x);

    // И стоит в той же колонке, что ручка абзаца над таблицей.
    const paragraph = (await page.locator(editable).first().boundingBox())!;

    await page.mouse.move(paragraph.x + 10, paragraph.y + paragraph.height / 2);
    await expect.poll(async () => (await handle.boundingBox())?.y).toBeLessThan(tab.y);
    // Ручка появляется с анимацией: ждём, пока она встанет на место.
    await expect
      .poll(async () => Math.abs((await handle.boundingBox())!.x - tab.x))
      .toBeLessThanOrEqual(1);
    await hover(page, 0, 0);
    await expect.poll(async () => (await handle.boundingBox())?.y).toBe(tab.y);

    for (const name of ['row-grip', 'column-grip', 'row-insert', 'column-insert']) {
      for (const box of await page.locator(part(name)).evaluateAll((nodes) =>
        nodes.map((node) => {
          const { x, y, width, height } = node.getBoundingClientRect();

          return { x, y, width, height };
        }),
      )) {
        const overlapX = Math.min(tab.x + tab.width, box.x + box.width) - Math.max(tab.x, box.x);
        const overlapY = Math.min(tab.y + tab.height, box.y + box.height) - Math.max(tab.y, box.y);

        expect(overlapX > 1 && overlapY > 1, `${name} overlaps the block handle`).toBe(false);
      }
    }
  });

  test('every stretch of a column border has its own width handle next to merged cells', async ({
    page,
  }) => {
    // Пять строк, строки 2–3 объединены по двум столбцам: граница столбца 0 есть в строках 0–1 и в строке 4.
    await page.evaluate(() => {
      const { editor } = (window as never as { __inkbrick: { main: { editor: never } } }).__inkbrick
        .main as never as {
        editor: {
          document: { rootId: string; getBlock: (id: string) => never };
          dispatch: (intent: unknown) => unknown;
        };
      };
      let found = '';
      const walk = (block: { flavour: string; id: string; children: string[] } | undefined) => {
        if (!block || found) return;
        if (block.flavour === 'block:table') found = block.id;
        block.children.forEach((id) => walk(editor.document.getBlock(id)));
      };

      walk(editor.document.getBlock(editor.document.rootId));
      editor.dispatch({ type: 'insertTableRow', payload: { blockId: found, index: 3 } });
      editor.dispatch({ type: 'insertTableRow', payload: { blockId: found, index: 4 } });
      editor.dispatch({
        type: 'mergeTableCells',
        payload: { blockId: found, range: { top: 2, bottom: 3, left: 0, right: 1 } },
      });
    });
    await hover(page, 0, 2);

    const handles = await page.locator(part('resize')).evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();

        return {
          x: Math.round(box.left),
          top: Math.round(box.top),
          height: Math.round(box.height),
        };
      }),
    );
    const first = handles[0].x;
    const onFirstBorder = handles.filter((handle) => Math.abs(handle.x - first) < 3);

    // Два участка границы — две ручки: одна наверху, другая под объединением.
    expect(onFirstBorder).toHaveLength(2);
    expect(onFirstBorder[1].top).toBeGreaterThan(onFirstBorder[0].top + onFirstBorder[0].height);
  });

  test('a press on the empty lower part of a tall merged cell puts the caret into that cell', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const { editor } = (window as never as { __inkbrick: { main: { editor: never } } }).__inkbrick
        .main as never as {
        editor: {
          document: { rootId: string; getBlock: (id: string) => never };
          dispatch: (intent: unknown) => unknown;
        };
      };
      let found = '';
      const walk = (block: { flavour: string; id: string; children: string[] } | undefined) => {
        if (!block || found) return;
        if (block.flavour === 'block:table') found = block.id;
        block.children.forEach((id) => walk(editor.document.getBlock(id)));
      };

      walk(editor.document.getBlock(editor.document.rootId));
      for (let i = 0; i < 3; i++)
        editor.dispatch({ type: 'insertTableRow', payload: { blockId: found, index: 3 } });
      editor.dispatch({
        type: 'mergeTableCells',
        payload: { blockId: found, range: { top: 1, bottom: 5, left: 1, right: 2 } },
      });
    });

    const merged = (await page.locator(`${table} td[rowspan]`).first().boundingBox())!;

    // Ниже текста ячейки пусто: браузер ставил каретку в соседнюю ячейку той же строки, теперь — в саму объединённую.
    await page.mouse.click(merged.x + merged.width / 2, merged.y + merged.height * 0.92);
    await page.keyboard.type('Z');

    expect(await page.locator(`${table} td[rowspan]`).first().textContent()).toContain('Z');
    expect(
      await page
        .locator(`${table} td:not([rowspan])`)
        .evaluateAll((nodes) => nodes.filter((node) => node.textContent?.includes('Z')).length),
    ).toBe(0);
  });

  test('the handles do not lag behind the table while the page scrolls', async ({ page }) => {
    // Страница с запасом высоты: ручки стоят по `position: fixed` и должны ехать вместе с таблицей без отставания.
    await page.locator('.playground-content').evaluate((node) => {
      node.style.paddingBottom = '2000px';
    });
    await hover(page, 1, 1);

    const worst = await page.evaluate(async () => {
      const grip = document.querySelector('[data-inkbrick-part="column-grip"]') as HTMLElement;
      const block = document.querySelector('[data-inkbrick-block="table"]') as HTMLElement;
      const gap = () => grip.getBoundingClientRect().top - block.getBoundingClientRect().top;
      const first = gap();
      let max = 0;

      for (let step = 0; step < 12; step++) {
        window.scrollBy(0, 6);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        max = Math.max(max, Math.abs(gap() - first));
      }

      return max;
    });

    expect(worst).toBeLessThan(1.5);
  });

  test('resizing a column in the middle never makes the table scroll sideways', async ({
    page,
  }) => {
    // Много столбцов: ошибка округления каждой ширины накапливается и давала бы лишние пиксели.
    for (let added = 0; added < 4; added++) {
      await hover(page, 0, 0);
      await page.locator(part('column-insert')).nth(1).click();
    }

    for (const column of [0, 1, 3]) {
      await hover(page, 0, column);

      const handle = (await page.locator(part('resize')).nth(column).boundingBox())!;
      const x = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;

      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 37, y, { steps: 5 });
      await page.mouse.up();

      const overflow = await page.locator(table).evaluate((node) => {
        const block = node.closest('[data-inkbrick-block="table"]') as HTMLElement;

        return block.scrollWidth - block.clientWidth;
      });

      // Округление ширин не должно давать лишних пикселей: иначе внизу появляется полоса прокрутки.
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test('columns added to a fully stretched table stay on the page', async ({ page }) => {
    // Растянули последний столбец до предела страницы и добавили столбцы: они не должны уйти за правый край.
    await hover(page, 0, 2);

    const handle = (await page.locator(part('resize')).nth(2).boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 3000, y, { steps: 8 });
    await page.mouse.up();

    for (let added = 0; added < 3; added++) {
      await hover(page, 0, 0);
      await page.locator(part('column-insert')).nth(1).click();
    }

    const result = await page.locator(table).evaluate((node) => {
      const block = node.closest('[data-inkbrick-block="table"]') as HTMLElement;
      const last = [...node.querySelectorAll('tr:first-child > td')].at(-1) as HTMLElement;

      return {
        overflow: block.scrollWidth - block.clientWidth,
        lastRight: last.getBoundingClientRect().right,
        blockRight: block.getBoundingClientRect().right,
        columns: node.querySelectorAll('tr:first-child > td').length,
      };
    });

    expect(result.columns).toBe(6);
    expect(result.overflow).toBeLessThanOrEqual(0);
    expect(result.lastRight).toBeLessThanOrEqual(result.blockRight + 1);
  });

  test('dragging on a narrow page keeps the widths the user set', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await hover(page, 0, 0);

    const tableWidth = () =>
      page
        .locator('.block-table [data-inkbrick-part="grid"]')
        .evaluate((node) => node.getBoundingClientRect().width);
    const before = await tableWidth();

    const drag = async (index: number, delta: number) => {
      const handle = (await page.locator(part('resize')).nth(index).boundingBox())!;
      const x = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;

      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + delta, y, { steps: 6 });
      await page.mouse.up();
    };
    const widthOf = (column: number) =>
      page
        .locator(cells)
        .nth(column)
        .evaluate((node) => node.getBoundingClientRect().width);

    await drag(0, 60);
    // Перетаскивание не сужает таблицу: округление ширин сохраняет сумму.
    expect(Math.abs((await tableWidth()) - before)).toBeLessThan(1);

    await hover(page, 0, 2);
    // Правый край последнего столбца тянем до упора: он растянется до края страницы.
    await drag(2, 3000);

    // Ширины заполняют блок и не дают полосы прокрутки, даже на пиксель.
    expect(
      await page.locator('.block-table').evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(0);

    const third = await widthOf(2);

    // Окно сузили: отрисованные ширины подгоняются под страницу, модель не должна меняться.
    await page.setViewportSize({ width: 375, height: 700 });
    await hover(page, 0, 0);
    await drag(0, 20);

    await page.setViewportSize({ width: 900, height: 700 });
    await hover(page, 0, 0);

    expect(Math.abs((await widthOf(2)) - third)).toBeLessThan(2);
  });

  test('arrow down and up move to the same column of the next and the previous row', async ({
    page,
  }) => {
    await page.locator(cells).nth(1).click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('X');

    // Вниз из первой строки — в ту же колонку второй строки, а не в следующую ячейку по порядку.
    expect((await grid(page))[1][1]).toContain('X');
    expect((await grid(page))[0][2]).not.toContain('X');

    await page.keyboard.press('ArrowUp');
    await page.keyboard.type('Y');

    expect((await grid(page))[0][1]).toContain('Y');
  });

  test('arrow down reaches a cell merged across columns from the column it covers', async ({
    page,
  }) => {
    // B2:C2 объединены; каретка в C1, стрелка вниз — в объединённую ячейку (B2), а не через строку в C3.
    await page.evaluate(() => {
      const { editor } = (window as never as { __inkbrick: { main: { editor: never } } }).__inkbrick
        .main as never as {
        editor: {
          document: { rootId: string; getBlock: (id: string) => never };
          dispatch: (intent: unknown) => unknown;
        };
      };
      let found = '';
      const walk = (block: { flavour: string; id: string; children: string[] } | undefined) => {
        if (!block || found) return;
        if (block.flavour === 'block:table') found = block.id;
        block.children.forEach((id) => walk(editor.document.getBlock(id)));
      };

      walk(editor.document.getBlock(editor.document.rootId));
      editor.dispatch({
        type: 'mergeTableCells',
        payload: { blockId: found, range: { top: 1, bottom: 1, left: 1, right: 2 } },
      });
    });

    await page.locator(cells).nth(2).click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('X');

    expect((await grid(page))[1][1]).toContain('X');
    expect((await grid(page))[2][2]).not.toContain('X');
  });

  test('«Wider» in the context menu of a cell merged across columns widens only its first column', async ({
    page,
  }) => {
    const widths = () =>
      page.evaluate(() => {
        const { editor } = (window as never as { __inkbrick: { main: { editor: never } } })
          .__inkbrick.main as never as {
          editor: {
            document: { rootId: string; getBlock: (id: string) => never };
            dispatch: (intent: unknown) => unknown;
          };
        };
        let found: { id: string; props: { widths?: number[] } } | undefined;
        const walk = (
          block:
            | { flavour: string; id: string; children: string[]; props: { widths?: number[] } }
            | undefined,
        ) => {
          if (!block || found) return;
          if (block.flavour === 'block:table') found = block;
          block.children.forEach((id) => walk(editor.document.getBlock(id)));
        };

        walk(editor.document.getBlock(editor.document.rootId));
        if (!found!.props.widths)
          editor.dispatch({
            type: 'mergeTableCells',
            payload: { blockId: found!.id, range: { top: 0, bottom: 0, left: 0, right: 2 } },
          });

        return found!.props.widths ?? null;
      });

    expect(await widths()).toBeNull();
    const column = await page
      .locator(cells)
      .nth(3)
      .evaluate((node) => node.getBoundingClientRect().width);

    await page.locator(cells).nth(0).click({ button: 'right' });
    await page.locator('[data-action="table-column-wider"]').click();

    // Шаг от ширины одного столбца, а не от всей объединённой ячейки.
    await expect.poll(async () => (await widths())?.[0] ?? 0).toBeGreaterThan(column);
    expect((await widths())![0]).toBeLessThan(column + 40);
  });

  test('shift click without a selection selects the cells from the caret to the clicked one', async ({
    page,
  }) => {
    await page.locator(cells).nth(0).locator(editable).click();
    await page
      .locator(cells)
      .nth(4)
      .click({ modifiers: ['Shift'] });

    await expect(page.locator(`${table} td[data-cell-selected]`)).toHaveCount(4);
  });

  test('typing over a selection replaces the anchor cell only', async ({ page }) => {
    await page.locator(cells).nth(0).locator(editable).click();
    await page
      .locator(cells)
      .nth(4)
      .click({ modifiers: ['Shift'] });
    await page.keyboard.type('Z');

    const after = await grid(page);

    expect(after[0][0]).toBe('Z');
    expect(after[0][1]).toBe('r0c1');
    expect(after[1][1]).toBe('r1c1');
  });

  test('the first row is the column header for screen readers and the table has a name', async ({
    page,
  }) => {
    await expect(page.locator(cells).nth(0)).toHaveAttribute('role', 'columnheader');
    await expect(page.locator(cells).nth(3)).not.toHaveAttribute('role', 'columnheader');
    await expect(page.locator('[data-inkbrick-part="grid"]')).toHaveAttribute('aria-label', /.+/);
  });

  test('many columns keep their minimum width, the table scrolls instead of squeezing them', async ({
    page,
  }) => {
    for (let added = 0; added < 12; added++) {
      await hover(page, 0, 0);
      await page.locator(part('column-insert')).nth(1).click();
    }

    const widths = await page
      .locator(`${table} tr:first-child td`)
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));

    expect(widths).toHaveLength(15);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(60);
  });

  test('after Escape in a cell a paste fills the table, as in MS Office, and adds no table', async ({
    page,
  }) => {
    await page.locator(cells).nth(0).locator(editable).click();
    await page
      .locator(cells)
      .nth(4)
      .click({ modifiers: ['Shift'] });
    await page.keyboard.press(`${modifier}+c`);

    await page.locator(cells).nth(8).locator(editable).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${modifier}+v`);

    await expect(page.locator(table)).toHaveCount(1);
    expect((await grid(page))[2][2]).toBe('r0c0');
  });

  test('the table cannot be stretched beyond the page', async ({ page }) => {
    await hover(page, 0, 2);

    const handle = (await page.locator(part('resize')).nth(2).boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 3000, y, { steps: 8 });
    await page.mouse.up();

    // Таблица шире своего блока стать не может: прокрутки по горизонтали нет.
    const fits = await page.locator(table).evaluate((node) => {
      const block = node.closest('[data-inkbrick-block="table"]') as HTMLElement;

      return block.scrollWidth <= block.clientWidth + 1;
    });

    expect(fits).toBe(true);
  });

  test('a double click on the border sets the width back to automatic', async ({ page }) => {
    await hover(page, 0, 0);

    const handle = (await page.locator(part('resize')).nth(1).boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 50, y, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator(`${table} col`).nth(1)).toHaveAttribute('style', /width/);

    await hover(page, 0, 0);

    const again = (await page.locator(part('resize')).nth(1).boundingBox())!;

    await page.mouse.dblclick(again.x + again.width / 2, again.y + again.height / 2);

    // У столбца ширины больше нет (занимает остаток), у остальных она осталась.
    await expect(page.locator(`${table} col`).nth(1)).not.toHaveAttribute('style', /width/);
    await expect(page.locator(`${table} col`).first()).toHaveAttribute('style', /width/);
  });

  test('a border between columns leaves the other columns as they are', async ({ page }) => {
    await hover(page, 0, 0);

    const widths = async () =>
      page
        .locator(cells)
        .evaluateAll((items) =>
          items.slice(0, 3).map((item) => Math.round(item.getBoundingClientRect().width)),
        );
    const before = await widths();
    const handle = (await page.locator(part('resize')).nth(0).boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 5 });
    await page.mouse.up();

    const after = await widths();

    expect(after[0]).toBeGreaterThan(before[0] + 30);
    expect(after[1]).toBeLessThan(before[1] - 30);
    expect(Math.abs(after[2] - before[2])).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after[0] + after[1] + after[2] - (before[0] + before[1] + before[2])),
    ).toBeLessThanOrEqual(2);
  });

  test('the controls are not part of what gets copied', async ({ page }) => {
    await hover(page, 1, 1);
    await page.keyboard.press(`${modifier}+a`);

    const html = await page.evaluate(() => {
      const range = getSelection()!.getRangeAt(0).cloneContents();
      const holder = document.createElement('div');

      holder.append(range);

      return holder.innerHTML;
    });

    expect(html).not.toContain('table-controls');
  });
});
