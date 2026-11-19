import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '.block-table';
const cells = `${table} td`;
const blockMenu = '[data-testid="block-menu"]';

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

async function openTableMenu(page: Page) {
  await page.locator(table).hover();
  await page.locator('[data-inkbrick-part="table-grip"]').click();
  await expect(page.locator(blockMenu)).toBeVisible();
}

async function dragCells(page: Page, from: number, to: number) {
  const a = (await page.locator(cells).nth(from).boundingBox())!;
  const b = (await page.locator(cells).nth(to).boundingBox())!;

  await page.mouse.move(a.x + 6, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

const tableStyle = (page: Page) =>
  page.locator(table).evaluate((node) => node.getAttribute('data-table-style'));
const modelStyle = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window.__inkbrick!.main;
    const stack = [editor.document.rootId];

    while (stack.length > 0) {
      const block = editor.document.getBlock(stack.pop()!)!;

      if (block.flavour === 'block:table') return block.props.tableStyle ?? null;

      stack.push(...block.children);
    }

    return null;
  });
const cellBorder = (page: Page, index: number, side: string) =>
  page
    .locator(cells)
    .nth(index)
    .evaluate((node, name) => node.getAttribute(`data-border-${name}`), side);

test.describe('Table style gallery and borders', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
  });

  test('the menu shows the gallery with miniatures and the border buttons', async ({ page }) => {
    await openTableMenu(page);

    await expect(page.locator('[data-inkbrick-part="style-option"]')).toHaveCount(8);
    await expect(page.locator('[data-inkbrick-part="border-mode"]')).toHaveCount(10);
    await expect(page.locator('[data-action="table-style-plain"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('hovering a style previews it on the table, leaving restores it, a click applies it', async ({
    page,
  }) => {
    await openTableMenu(page);

    await page.locator('[data-action="table-style-blue"]').hover();
    await expect.poll(() => tableStyle(page)).toBe('blue');
    // Предпросмотр не пишет в документ.
    expect(await modelStyle(page)).toBeNull();

    await page.mouse.move(5, 5);
    await expect.poll(() => tableStyle(page)).toBeNull();

    await page.locator('[data-action="table-style-green"]').click();
    await expect.poll(() => tableStyle(page)).toBe('green');
    expect(await modelStyle(page)).toBe('green');

    // Один шаг undo.
    await page.keyboard.press('Control+z');
    await expect.poll(() => modelStyle(page)).toBeNull();
  });

  /** Вычисленные стили ячейки простым объектом: `CSSStyleDeclaration` целиком Firefox и WebKit не передают. */
  const cellStyle = (page: Page, index: number) =>
    page
      .locator(cells)
      .nth(index)
      .evaluate((node) => {
        const style = getComputedStyle(node);

        return {
          backgroundColor: style.backgroundColor,
          borderTopColor: style.borderTopColor,
          borderTopWidth: style.borderTopWidth,
        };
      });

  test('a style paints the header and the lines with its colors', async ({ page }) => {
    await openTableMenu(page);
    await page.locator('[data-action="table-style-blue"]').click();

    const header = await cellStyle(page, 0);
    const plain = await cellStyle(page, 4);

    expect(header.backgroundColor).not.toBe(plain.backgroundColor);
    expect(header.borderTopColor).not.toBe('rgb(0, 0, 0)');
  });

  test('width and color change the lines at once, then no borders', async ({ page }) => {
    // Толщина и цвет сразу меняют существующие линии: ничего больше нажимать не нужно.
    await openTableMenu(page);
    await page.locator('[data-action="table-border-width-thick"]').click();

    for (const index of [0, 4, 8]) {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        expect(await cellBorder(page, index, side)).toBe('thick');
      }
    }

    expect((await cellStyle(page, 4)).borderTopWidth).toBe('3px');

    await openTableMenu(page);
    await page.locator('[data-action="table-border-style-dashed"]').click();
    expect(await page.locator(cells).nth(4).getAttribute('data-border-style')).toBe('dashed');

    await openTableMenu(page);
    await page.locator('[data-action="table-border-color-red"]').click();
    expect(await page.locator(cells).nth(4).getAttribute('data-border-color')).toBe('red');

    await openTableMenu(page);
    await page.locator('[data-action="table-border-none"]').click();

    expect(await cellBorder(page, 4, 'top')).toBe('none');
    expect(await cellBorder(page, 0, 'left')).toBe('none');
  });

  test('outside borders of the selected cells only touch the edge of the selection', async ({
    page,
  }) => {
    await dragCells(page, 0, 4);
    await openTableMenu(page);
    await page.locator('[data-action="table-border-outside"]').click();

    // Выделены ячейки 0, 1, 3, 4: внешняя рамка вокруг них, а внутри линий нет.
    expect(await cellBorder(page, 0, 'top')).toBe('thin');
    expect(await cellBorder(page, 0, 'left')).toBe('thin');
    expect(await cellBorder(page, 4, 'bottom')).toBe('thin');
    expect(await cellBorder(page, 4, 'right')).toBe('thin');
    expect(await cellBorder(page, 0, 'right')).toBeNull();
    expect(await cellBorder(page, 0, 'bottom')).toBeNull();
    // Соседи за краем выделения получили ту же линию со своей стороны.
    expect(await cellBorder(page, 2, 'left')).toBe('thin');
    expect(await cellBorder(page, 7, 'top')).toBe('thin');
    expect(await cellBorder(page, 8, 'top')).toBeNull();
  });

  test('the cell context menu has nested menus: a style, borders and a background apply and close it', async ({
    page,
  }) => {
    const box = (await page.locator(cells).nth(4).boundingBox())!;
    const context = page.locator('[data-testid="context-menu"]');
    const flyout = (name: string) => page.locator(`[data-flyout="${name}"]`);
    const openContext = async () => {
      await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2, { button: 'right' });
      await expect(context).toBeVisible();
    };

    await openContext();
    await context.locator('[data-action="table-style"]').hover();
    await expect(flyout('table-style').locator('[data-inkbrick-part="style-option"]')).toHaveCount(
      8,
    );

    // Предпросмотр и здесь: наведение красит таблицу, документ не меняется.
    await flyout('table-style').locator('[data-action="table-style-orange"]').hover();
    await expect.poll(() => tableStyle(page)).toBe('orange');
    expect(await modelStyle(page)).toBeNull();

    await flyout('table-style').locator('[data-action="table-style-orange"]').click();
    await expect(context).toBeHidden();
    expect(await modelStyle(page)).toBe('orange');

    await openContext();
    await context.locator('[data-action="table-cell-borders"]').hover();
    await expect(
      flyout('table-cell-borders').locator('[data-action^="table-border-"]'),
    ).not.toHaveCount(0);
    await flyout('table-cell-borders').locator('[data-action="table-border-outside"]').click();
    await expect(context).toBeHidden();
    expect(await cellBorder(page, 0, 'top')).toBe('thin');
    expect(await cellBorder(page, 4, 'top')).toBeNull();

    // Фон ячейки: цвет из круглых образцов, затем «Убрать цвет».
    await openContext();
    await context.locator('[data-action="table-cell-background"]').hover();
    await flyout('table-cell-background').locator('[data-action="color-green"]').click();
    await expect(context).toBeHidden();
    expect(await page.locator(cells).nth(4).getAttribute('data-background')).toBe('green');

    await openContext();
    await context.locator('[data-action="table-cell-background"]').hover();
    await flyout('table-cell-background').locator('[data-action="color-remove"]').click();
    expect(await page.locator(cells).nth(4).getAttribute('data-background')).toBeNull();
  });

  test('a width, a style and a colour from the nested menus change the existing lines', async ({
    page,
  }) => {
    const box = (await page.locator(cells).nth(4).boundingBox())!;
    const context = page.locator('[data-testid="context-menu"]');
    const pick = async (menu: string, action: string) => {
      await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2, { button: 'right' });
      await context.locator('[data-action="table-cell-borders"]').hover();
      await page.locator('[data-flyout="table-cell-borders"] [data-action="' + menu + '"]').hover();
      await page.locator(`[data-flyout="${menu}"] [data-action="${action}"]`).click();
      await expect(context).toBeHidden();
    };

    await pick('table-border-widthMenu', 'table-border-width-thick');
    expect(await cellBorder(page, 4, 'top')).toBe('thick');

    await pick('table-border-styleMenu', 'table-border-style-dotted');
    expect(await page.locator(cells).nth(4).getAttribute('data-border-style')).toBe('dotted');

    await pick('table-border-colorMenu', 'color-red');
    expect(await page.locator(cells).nth(4).getAttribute('data-border-color')).toBe('red');
  });

  test('the menu with the gallery and the borders passes the accessibility check', async ({
    page,
  }) => {
    await openTableMenu(page);
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => 0))),
    );

    const result = await new AxeBuilder({ page })
      .include('[data-inkbrick-ui="block-menu"]')
      .analyze();

    expect(
      result.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => violation.id),
    ).toEqual([]);
  });
});

test.describe('Table handles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
  });

  test('the markers sit on the axis of their pill and on the boundaries', async ({ page }) => {
    await page.locator(cells).nth(4).hover();

    const centre = async (part: string, nth = 0) => {
      const box = (await page.locator(`[data-inkbrick-part="${part}"]`).nth(nth).boundingBox())!;

      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const [row, above, below, column, left, right] = await Promise.all([
      centre('row-grip'),
      centre('row-insert', 0),
      centre('row-insert', 1),
      centre('column-grip'),
      centre('column-insert', 0),
      centre('column-insert', 1),
    ]);

    // Маркеры строки лежат на оси плашки строки, маркеры столбца — на оси плашки столбца.
    expect(Math.abs(above.x - row.x)).toBeLessThan(1);
    expect(Math.abs(below.x - row.x)).toBeLessThan(1);
    expect(Math.abs(left.y - column.y)).toBeLessThan(1);
    expect(Math.abs(right.y - column.y)).toBeLessThan(1);
    // Выше и ниже плашки строки, левее и правее плашки столбца.
    expect(above.y).toBeLessThan(row.y);
    expect(below.y).toBeGreaterThan(row.y);
    expect(left.x).toBeLessThan(column.x);
    expect(right.x).toBeGreaterThan(column.x);
  });

  test('a marker on a boundary inserts a column or a row there', async ({ page }) => {
    await page.locator(cells).nth(4).hover();
    await page.locator('[data-inkbrick-part="column-insert"]').nth(1).click();
    await expect(page.locator(`${table} tr`).first().locator('td')).toHaveCount(4);

    await page.locator(cells).nth(5).hover();
    await page.locator('[data-inkbrick-part="row-insert"]').nth(0).click();
    await expect(page.locator(`${table} tr`)).toHaveCount(4);
  });

  test('a hint tells how to open the menu', async ({ page }) => {
    const cell = (await page.locator(cells).nth(4).boundingBox())!;

    await page.mouse.move(cell.x + 20, cell.y + 10);

    const grip = (await page.locator('[data-inkbrick-part="table-grip"]').boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 6 });

    const tip = page.locator('[data-inkbrick-part="tip"]:visible');

    await expect(tip).toHaveText('Click to open the menu');
    // Подсказка тёмная в обеих темах и стоит над таблицей, а не на ней.
    await expect(tip).toHaveCSS('background-color', 'rgb(43, 43, 43)');

    const [tipBox, tableBox] = await Promise.all([
      tip.boundingBox(),
      page.locator(table).boundingBox(),
    ]);

    expect(tipBox!.y + tipBox!.height).toBeLessThanOrEqual(tableBox!.y + 1);
  });
});

test.describe('Table design on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');

  test('the table menu with the styles and borders fits the screen and has big enough buttons', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await insertTable(page);

    const cell = (await page.locator(cells).nth(4).boundingBox())!;

    await page.touchscreen.tap(cell.x + 10, cell.y + 10);
    await page.locator('[data-inkbrick-part="table-grip"]').tap();

    const menu = page.locator(blockMenu);

    await expect(menu).toBeVisible();

    const inside = await menu.evaluate((node) => {
      const box = node.getBoundingClientRect();

      return box.left >= 0 && box.right <= window.innerWidth && box.top >= 0;
    });

    expect(inside).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );

    // Секции лежат ниже пунктов: меню прокручивается, пальцу нужны кнопки не меньше 44 пикселей.
    await menu.locator('[data-action="table-border-all"]').scrollIntoViewIfNeeded();

    for (const action of ['table-border-all', 'table-border-width-thick', 'table-style-blue']) {
      expect(
        (await menu.locator(`[data-action="${action}"]`).boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }

    // Толщина меняет линии сразу и закрывает меню.
    await menu.locator('[data-action="table-border-width-thick"]').tap();

    expect(await cellBorder(page, 4, 'top')).toBe('thick');
  });

  test('the cell stays in view when the on-screen keyboard shrinks the window', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await insertTable(page);

    const cell = page.locator(cells).nth(4);
    const box = (await cell.boundingBox())!;

    await page.touchscreen.tap(box.x + 10, box.y + 10);
    // Клавиатура съедает низ окна: ячейка оказывается под ней.
    await page.setViewportSize({ width: 375, height: Math.max(200, Math.round(box.y) - 10) });

    await expect
      .poll(async () =>
        cell.evaluate((node) => {
          const rect = node.getBoundingClientRect();

          return rect.top >= 0 && rect.bottom <= (window.visualViewport?.height ?? innerHeight);
        }),
      )
      .toBe(true);
  });
});
