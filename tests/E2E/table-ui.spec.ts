import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const part = (name: string) => `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${name}"]`;

interface Build {
  rows: number;
  columns: number;
  /** Таблица во второй колонке блока колонок рядом с абзацем. */
  inColumns?: boolean;
  props?: Record<string, unknown>;
  merges?: { row: number; column: number; rows: number; columns: number }[];
}

/** Таблица через движок песочницы: ячейки подписаны `r<строка>c<столбец>`. Возвращает id таблицы. */
async function build(page: Page, options: Build) {
  await page.goto('/?lang=en');
  await page.locator(editable).first().click();

  return page.evaluate((options) => {
    type Block = {
      id: string;
      flavour: string;
      parentId: string;
      children: string[];
      content: { insert: string }[];
    };
    const { editor } = (
      window as never as {
        __inkbrick: {
          main: {
            editor: {
              document: { rootId: string; getBlock: (id: string) => Block };
              dispatch: (intent: unknown) => { blockId: string } | undefined;
            };
          };
        };
      }
    ).__inkbrick.main;
    const get = (id: string) => editor.document.getBlock(id);
    const note = get(get(editor.document.rootId).children[0]);
    const first = note.children[0];
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: first },
    })!;
    const tableId = get(get(caret.blockId).parentId).parentId;
    const run = (type: string, payload: Record<string, unknown>) =>
      editor.dispatch({ type, payload: { blockId: tableId, ...payload } });
    const size = () => ({
      rows: get(tableId).children.length,
      columns: get(get(tableId).children[0]).children.length,
    });

    while (size().rows < options.rows) run('insertTableRow', { index: size().rows });
    while (size().columns < options.columns) run('insertTableColumn', { index: size().columns });

    get(tableId).children.forEach((rowId, r) =>
      get(rowId).children.forEach((cellId, c) =>
        editor.dispatch({
          type: 'replaceText',
          payload: { blockId: cellId, from: 0, to: 0, text: `r${r}c${c}` },
        }),
      ),
    );

    for (const merge of options.merges ?? [])
      run('mergeTableCells', {
        range: {
          top: merge.row,
          left: merge.column,
          bottom: merge.row + merge.rows - 1,
          right: merge.column + merge.columns - 1,
        },
      });

    if (options.props)
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: tableId, props: options.props },
      });

    if (options.inColumns) {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: first, from: 0, to: 0, text: 'side' },
      });
      editor.dispatch({
        type: 'moveBlockToSide',
        payload: { blockId: tableId, targetId: first, side: 'right' },
      });
    }

    return tableId;
  }, options);
}

const cell = (page: Page, r: number, c: number) =>
  page.locator(`${table} tr`).nth(r).locator('td').nth(c);

async function hoverCell(page: Page, r: number, c: number) {
  const box = (await cell(page, r, c).boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

const tableProps = (page: Page) =>
  page.evaluate(() => {
    type Block = { flavour: string; children: string[]; props: Record<string, unknown> };
    const { editor } = (
      window as never as {
        __inkbrick: {
          main: { editor: { document: { rootId: string; getBlock: (id: string) => Block } } };
        };
      }
    ).__inkbrick.main;
    const found: Record<string, Record<string, unknown>> = {};
    const walk = (id: string) => {
      const block = editor.document.getBlock(id);

      if (!block) return;
      if (block.flavour === 'block:table' || block.flavour === 'block:columns')
        found[block.flavour] = block.props;
      block.children.forEach(walk);
    };

    walk(editor.document.rootId);

    return found;
  });

test.describe('Table UI in tight places', () => {
  test('a wide table scrolled inside a narrow column keeps its handles on the hovered row and column', async ({
    page,
  }) => {
    await build(page, { rows: 3, columns: 9, inColumns: true });
    await page.mouse.move(2, 2);

    const scroller = page.locator(table);

    // Таблица шире колонки и прокручивается внутри своего блока.
    expect(await scroller.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await scroller.evaluate((node) => (node.scrollLeft = node.scrollWidth));

    const column = (await page.locator('[data-inkbrick-block="column"]').nth(1).boundingBox())!;

    await hoverCell(page, 1, 8);

    const rowGrip = (await page.locator(part('row-grip')).boundingBox())!;
    const columnGrip = (await page.locator(part('column-grip')).boundingBox())!;
    const target = (await cell(page, 1, 8).boundingBox())!;

    // Ручка строки — у видимого левого края таблицы, в пределах колонки, на высоте строки.
    expect(rowGrip.x).toBeGreaterThan(column.x - 40);
    expect(rowGrip.y + rowGrip.height / 2).toBeGreaterThan(target.y);
    expect(rowGrip.y + rowGrip.height / 2).toBeLessThan(target.y + target.height);
    // Ручка столбца — над наведённым столбцом.
    expect(columnGrip.x + columnGrip.width / 2).toBeGreaterThan(target.x);
    expect(columnGrip.x + columnGrip.width / 2).toBeLessThan(target.x + target.width);
  });

  test('resizing a table column inside columns does not move the divider of the columns, and back', async ({
    page,
  }) => {
    await build(page, { rows: 2, columns: 2, inColumns: true });
    await page.mouse.move(2, 2);
    await hoverCell(page, 0, 0);

    const handle = page.locator(part('resize')).first();
    const box = (await handle.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    const after = await tableProps(page);

    expect((after['block:table'].widths as (number | null)[])[0]).toBeGreaterThan(0);
    expect(after['block:columns'].ratios).toBeUndefined();

    // Разделитель колонок двигает колонки, но не ширины столбцов таблицы.
    await page.locator('[data-inkbrick-block="columns"]').hover({ position: { x: 20, y: 10 } });

    const divider = (await page.locator('[data-inkbrick-part="divider"]').boundingBox())!;

    await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
    await page.mouse.down();
    await page.mouse.move(divider.x - 60, divider.y + divider.height / 2, { steps: 6 });
    await page.mouse.up();

    const moved = await tableProps(page);

    expect(moved['block:columns'].ratios).toBeDefined();
    expect(moved['block:table'].widths).toEqual(after['block:table'].widths);
  });
});

test.describe('Frozen first row and column', () => {
  test.beforeEach(async ({ page }) => {
    await build(page, { rows: 20, columns: 14, props: { freezeRow: true, freezeColumn: true } });
    // Таблица ниже своей предельной высоты прокручивается внутри: так видно закреплённую строку.
    await page.addStyleTag({ content: ':root { --inkbrick-table-frozen-height: 220px; }' });
    await page.mouse.move(2, 2);
  });

  test('the first row and column stay in view while the table scrolls', async ({ page }) => {
    const scroller = page.locator(table);
    const frame = (await scroller.boundingBox())!;

    await scroller.evaluate((node) => {
      node.scrollTop = 300;
      node.scrollLeft = 300;
    });

    const header = (await cell(page, 0, 3).boundingBox())!;
    const first = (await cell(page, 10, 0).boundingBox())!;

    expect(Math.abs(header.y - frame.y)).toBeLessThan(4);
    expect(Math.abs(first.x - frame.x)).toBeLessThan(4);
  });

  test('frozen cells can be typed into and selected while the table is scrolled', async ({
    page,
  }) => {
    const scroller = page.locator(table);

    await scroller.evaluate((node) => {
      node.scrollTop = 300;
      node.scrollLeft = 300;
    });

    // Клик в закреплённую строку заголовка поверх прокрученного тела: текст идёт в неё, а не в строку под ней.
    const header = (await cell(page, 0, 9).boundingBox())!;

    await page.mouse.click(header.x + header.width - 6, header.y + header.height / 2);
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(cell(page, 0, 9).locator(editable)).toHaveText('r0c9!');

    // И в закреплённый столбец поверх прокрученных столбцов.
    const side = (await cell(page, 11, 0).boundingBox())!;

    await page.mouse.click(side.x + 6, side.y + side.height / 2);
    await page.keyboard.press('End');
    await page.keyboard.type('?');
    await expect(cell(page, 11, 0).locator(editable)).toHaveText('r11c0?');

    // Протяжка от закреплённого столбца в тело выделяет прямоугольник.
    // Столбец 0 закреплён поверх прокрученного тела; столбец 7 виден правее него. Строка 10 ставится сразу под
    // закреплённый заголовок: высота строк зависит от шрифтов машины, поэтому прокрутка считается, а не задаётся числом.
    await scroller.evaluate((node) => {
      const rows = node.querySelectorAll('tr');
      const header = (rows[0] as HTMLElement).getBoundingClientRect().height;

      node.scrollTop = (rows[10] as HTMLElement).offsetTop - header - 2;
    });

    const frame = (await scroller.boundingBox())!;
    const a = (await cell(page, 10, 0).boundingBox())!;

    expect(Math.abs(a.x - frame.x)).toBeLessThan(4);

    await page.mouse.move(a.x + 6, a.y + a.height / 2);
    await page.mouse.down();

    // Нажатие может подвинуть прокрутку (ячейка с кареткой встаёт в поле зрения): цель меряется после него.
    const b = (await cell(page, 11, 7).boundingBox())!;

    expect(b.x).toBeGreaterThan(a.x + a.width);
    expect(b.y + b.height).toBeLessThan(frame.y + frame.height);

    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('[data-cell-selected]')).toHaveCount(16);
    await expect(cell(page, 10, 0)).toHaveAttribute('data-cell-selected', 'true');
    await expect(cell(page, 11, 7)).toHaveAttribute('data-cell-selected', 'true');
  });
});

test.describe('Table accessibility and contrast', () => {
  const violations = async (page: Page) => {
    await page.evaluate(() =>
      Promise.all(
        document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      ),
    );

    const result = await new AxeBuilder({ page })
      .include('.inkbrick-editor')
      .include('[data-inkbrick-ui]')
      .analyze();

    return result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  };

  test('a table with merges, a header row and column and frozen cells, with its row menu open, passes axe', async ({
    page,
  }) => {
    await build(page, {
      rows: 4,
      columns: 4,
      merges: [{ row: 1, column: 1, rows: 2, columns: 2 }],
      props: { headerColumn: true, freezeRow: true, freezeColumn: true, striped: true },
    });
    await page.mouse.move(2, 2);
    expect(await violations(page)).toEqual([]);

    await hoverCell(page, 3, 1);
    await page.locator(part('row-grip')).click();
    await expect(page.locator('[data-inkbrick-ui="block-menu"]')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`every cell background keeps AA contrast with its text (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });

      const colors = [
        'gray',
        'brown',
        'orange',
        'yellow',
        'green',
        'blue',
        'purple',
        'pink',
        'red',
        'lime',
        'teal',
        'cyan',
        'indigo',
        'magenta',
      ];
      const tableId = await build(page, { rows: 2, columns: 7 });

      await page.evaluate(
        ({ tableId, colors }) => {
          const { editor } = (
            window as never as {
              __inkbrick: { main: { editor: { dispatch: (intent: unknown) => unknown } } };
            }
          ).__inkbrick.main;

          colors.forEach((background, index) =>
            editor.dispatch({
              type: 'setTableCellsBackground',
              payload: {
                blockId: tableId,
                range: {
                  top: Math.floor(index / 7),
                  bottom: Math.floor(index / 7),
                  left: index % 7,
                  right: index % 7,
                },
                background,
              },
            }),
          );
        },
        { tableId, colors },
      );
      await page.mouse.move(2, 2);

      const ratios = await page.locator(`${table} td[data-background]`).evaluateAll((cells) => {
        // Фон должен быть непрозрачным: полупрозрачный — уже ошибка (так выглядел фон блока поверх ячейки).
        const rgb = (value: string) => {
          const parts = value.match(/[\d.]+/g)!.map(Number);

          if (value.includes('/') || (value.startsWith('rgba') && parts[3] < 1))
            throw new Error(`translucent ${value}`);

          return parts.slice(0, 3);
        };
        const luminance = ([r, g, b]: number[]) => {
          const [R, G, B] = [r, g, b].map((v) => {
            const c = v / 255;

            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });

          return 0.2126 * R + 0.7152 * G + 0.0722 * B;
        };

        return cells.map((cell) => {
          const text = cell.querySelector('.editable') as HTMLElement;
          const back = luminance(rgb(getComputedStyle(cell).backgroundColor));
          const fore = luminance(rgb(getComputedStyle(text).color));
          const [hi, lo] = back > fore ? [back, fore] : [fore, back];

          return {
            background: cell.getAttribute('data-background'),
            ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
          };
        });
      });

      expect(ratios.map((item) => item.background)).toEqual(colors);
      for (const { background, ratio } of ratios)
        expect(ratio, `${background} on ${theme}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test.describe('Tables on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP touch events');

  const finger = async (page: Page) => {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0 }],
      });

    return {
      down: (x: number, y: number) => send('touchStart', x, y),
      move: (x: number, y: number) => send('touchMove', x, y),
      up: () => send('touchEnd'),
    };
  };
  const centre = async (page: Page, r: number, c: number) => {
    const box = (await cell(page, r, c).boundingBox())!;

    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  test('a long press and a drag across a merged cell select whole merges', async ({ page }) => {
    await build(page, {
      rows: 3,
      columns: 3,
      merges: [{ row: 1, column: 1, rows: 2, columns: 2 }],
    });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const touch = await finger(page);
    const from = await centre(page, 0, 0);
    const to = await centre(page, 1, 1);

    await touch.down(from.x, from.y);
    await page.waitForTimeout(700);
    await touch.move((from.x + to.x) / 2, (from.y + to.y) / 2);
    await touch.move(to.x, to.y);
    await touch.up();

    // Прямоугольник от (0,0) до объединения (1..2, 1..2) расширяется до него целиком: сетка 3×3, из неё видно
    // 6 ячеек (три закрыты объединением), и угловые (0,2) и (2,0) тоже выделены.
    await expect.poll(() => page.locator('[data-cell-selected]').count()).toBe(6);
    await expect(cell(page, 0, 2)).toHaveAttribute('data-cell-selected', 'true');
    await expect(cell(page, 2, 0)).toHaveAttribute('data-cell-selected', 'true');
    await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);
  });

  test('the column width bar works for a table inside columns', async ({ page }) => {
    await build(page, { rows: 2, columns: 2, inColumns: true });

    // На телефоне колонки встают друг под другом; таблица — во второй.
    await cell(page, 0, 1).tap();
    await page.locator(part('column-grip')).first().tap();
    await page.locator('[data-action="column-width-slider"]').tap();

    const bar = page.locator('[data-inkbrick-ui="column-width-bar"]');
    const slider = bar.locator('input[type="range"]');

    await expect(bar).toBeVisible();

    const box = (await bar.boundingBox())!;

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);

    const before = await cell(page, 0, 1).evaluate((node) => node.getBoundingClientRect().width);

    await slider.evaluate((input: HTMLInputElement, value) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

      set.call(input, String(Math.min(Number(input.max), Number(input.value) + value)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, 80);
    await expect
      .poll(() => cell(page, 0, 1).evaluate((node) => node.getBoundingClientRect().width))
      .toBeGreaterThan(before + 20);
  });
});

test.describe('The insert markers at the top left corner', () => {
  test('«row above» and «column left» are two separate markers, each on its own border', async ({
    page,
  }) => {
    await build(page, { rows: 3, columns: 3 });
    await page.mouse.move(2, 2);
    await hoverCell(page, 0, 0);

    const frame = (await page.locator(table).boundingBox())!;
    const row = page.locator(`${part('row-insert')}[data-edge="start"]`);
    const column = page.locator(`${part('column-insert')}[data-edge="start"]`);

    await expect(row).toHaveAttribute('aria-label', 'Insert row above');
    await expect(column).toHaveAttribute('aria-label', 'Insert column left');

    const a = (await row.boundingBox())!;
    const b = (await column.boundingBox())!;
    const centre = (box: { x: number; y: number; width: number; height: number }) => ({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });

    // «Строка выше» — на левой границе ниже угла, «столбец слева» — на верхней правее угла; они не касаются.
    expect(Math.abs(centre(a).x - frame.x)).toBeLessThan(4);
    expect(centre(a).y).toBeGreaterThan(frame.y + 6);
    expect(Math.abs(centre(b).y - frame.y)).toBeLessThan(4);
    expect(centre(b).x).toBeGreaterThan(frame.x + 6);
    expect(a.x + a.width <= b.x || a.y >= b.y + b.height).toBe(true);

    // Каждый делает своё.
    await row.click();
    await expect(page.locator(`${table} tr`)).toHaveCount(4);
    await expect(page.locator(`${table} tr`).first().locator('td')).toHaveCount(3);

    await page.mouse.move(2, 2);
    await hoverCell(page, 0, 0);
    await column.click();
    await expect(page.locator(`${table} tr`).first().locator('td')).toHaveCount(4);
    await expect(page.locator(`${table} tr`)).toHaveCount(4);
  });
});
