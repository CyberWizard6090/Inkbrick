import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
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
  await page.locator('[data-inkbrick-part="table-grip"]').click({ button: 'right' });
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

    // Меню остаётся открытым (стили пробуют один за другим); Esc возвращает фокус в документ, и undo — один шаг.
    await expect(page.locator(blockMenu)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(blockMenu)).toHaveCount(0);
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
    // Толщина, начертание и цвет оставляют меню открытым: их пробуют подряд.
    await expect(page.locator(blockMenu)).toBeVisible();

    for (const index of [0, 4, 8]) {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        expect(await cellBorder(page, index, side)).toBe('thick');
      }
    }

    expect((await cellStyle(page, 4)).borderTopWidth).toBe('3px');

    await page.locator('[data-action="table-border-style-dashed"]').click();
    expect(await page.locator(cells).nth(4).getAttribute('data-border-style')).toBe('dashed');

    await page.locator('[data-action="table-border-color-red"]').click();
    expect(await page.locator(cells).nth(4).getAttribute('data-border-color')).toBe('red');

    // Кнопка расположения линий применяется один раз и закрывает меню.
    await page.locator('[data-action="table-border-none"]').click();
    await expect(page.locator(blockMenu)).toHaveCount(0);

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
    // Без выделения границы получает одна ячейка под кареткой (четвёртая), а не вся таблица.
    expect(await cellBorder(page, 4, 'top')).toBe('thin');
    expect(await cellBorder(page, 4, 'left')).toBe('thin');
    expect(await cellBorder(page, 0, 'top')).toBeNull();
    expect(await cellBorder(page, 8, 'bottom')).toBeNull();

    // Фон ячейки: цвет из круглых образцов, затем «Убрать цвет».
    await openContext();
    await context.locator('[data-action="table-cell-background"]').hover();
    await flyout('table-cell-background').locator('[data-action="color-green"]').click();
    await expect(context).toBeHidden();
    expect(await page.locator(cells).nth(4).getAttribute('data-background')).toBe('green');
    // Остальные ячейки не окрашены: фон относится к ячейке, а не ко всей таблице.
    expect(await page.locator(cells).nth(0).getAttribute('data-background')).toBeNull();
    expect(await page.locator(cells).nth(8).getAttribute('data-background')).toBeNull();

    await openContext();
    await context.locator('[data-action="table-cell-background"]').hover();
    await flyout('table-cell-background').locator('[data-action="color-remove"]').click();
    expect(await page.locator(cells).nth(4).getAttribute('data-background')).toBeNull();
  });

  test('with several cells selected the context menu inserts and deletes all their rows and columns', async ({
    page,
  }) => {
    const context = page.locator('[data-testid="context-menu"]');
    const columnsNow = () => page.locator(`${table} tr`).first().locator('td').count();
    const rowsNow = () => page.locator(`${table} tr`).count();
    const openOn = async () => {
      await dragCells(page, 0, 4);

      const box = (await page.locator(cells).nth(4).boundingBox())!;

      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      await expect(context).toBeVisible();
    };

    // Выделены ячейки 0, 1, 3, 4: два столбца и две строки.
    await openOn();
    await expect(context.locator('[data-action="table-column-delete"]')).toHaveText(
      'Delete columns (2)',
    );
    await context.locator('[data-action="table-column-delete"]').click();
    expect(await columnsNow()).toBe(1);

    await page.keyboard.press(`${modifier}+z`);
    expect(await columnsNow()).toBe(3);

    await openOn();
    await context.locator('[data-action="table-row-delete"]').click();
    expect(await rowsNow()).toBe(1);

    await page.keyboard.press(`${modifier}+z`);
    expect(await rowsNow()).toBe(3);

    await openOn();
    await context.locator('[data-action="table-column-right"]').click();
    expect(await columnsNow()).toBe(5);

    await page.keyboard.press(`${modifier}+z`);
    expect(await columnsNow()).toBe(3);
  });

  test('a white line is visible on the light page and a black one on the dark page', async ({
    page,
  }) => {
    const pick = async (color: string) => {
      await openTableMenu(page);
      await page.locator(`[data-action="table-border-color-${color}"]`).click();
      // Цвет оставил меню открытым: расположение линий выбирается в нём же.
      await page.locator('[data-action="table-border-all"]').click();
    };

    await pick('white');
    // На светлой странице белая линия заменяется серой: иначе её не видно.
    expect((await cellStyle(page, 4)).borderTopColor).toBe('rgb(139, 139, 139)');

    await page.evaluate(() => document.documentElement.setAttribute('data-inkbrick-theme', 'dark'));
    expect((await cellStyle(page, 4)).borderTopColor).toBe('rgb(255, 255, 255)');

    await pick('black');
    expect((await cellStyle(page, 4)).borderTopColor).toBe('rgb(139, 139, 139)');

    await page.evaluate(() =>
      document.documentElement.setAttribute('data-inkbrick-theme', 'light'),
    );
    expect((await cellStyle(page, 4)).borderTopColor).toBe('rgb(0, 0, 0)');
  });

  test('in a narrow window the style panel does not cover the menu it opens from', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 520, height: 420 });
    await page.goto('/?lang=en');
    await insertTable(page);

    const box = (await page.locator(cells).nth(8).boundingBox())!;
    const context = page.locator('[data-testid="context-menu"]');

    await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2, { button: 'right' });
    await expect(context).toBeVisible();
    await context.locator('[data-action="table-style"]').hover();

    const flyout = (await page.locator('[data-flyout="table-style"]').boundingBox())!;
    const menu = (await context.boundingBox())!;
    const overlap = Math.max(
      0,
      Math.min(flyout.x + flyout.width, menu.x + menu.width) - Math.max(flyout.x, menu.x),
    );

    // Допуск на пиксель границ: без исправления перекрытие было около 47 пикселей.
    expect(overlap).toBeLessThanOrEqual(2);
  });

  test('the keyboard opens a nested panel, moves focus into it and walks its items', async ({
    page,
  }) => {
    const box = (await page.locator(cells).nth(4).boundingBox())!;
    const context = page.locator('[data-testid="context-menu"]');

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await expect(context).toBeVisible();

    const inFlyout = () =>
      page.evaluate(() => !!document.activeElement?.closest('[data-inkbrick-part="flyout"]'));

    await context.locator('[data-action="table-cell-background"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(inFlyout).toBe(true);

    const first = await page.evaluate(() => document.activeElement?.getAttribute('data-action'));

    await page.keyboard.press('ArrowDown');
    expect(await inFlyout()).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-action'))).not.toBe(
      first,
    );

    // Стрелка влево возвращает в родительский пункт, а не закрывает меню.
    await page.keyboard.press('ArrowLeft');
    expect(await inFlyout()).toBe(false);
    await expect(context).toBeVisible();

    // Escape во вложенной панели закрывает только её, родительское меню остаётся.
    await page.keyboard.press('ArrowRight');
    await expect.poll(inFlyout).toBe(true);
    await page.keyboard.press('Escape');
    expect(await inFlyout()).toBe(false);
    // Выход анимируется: даём ей закончиться, родительское меню должно остаться.
    await page.waitForTimeout(400);
    await expect(context).toBeVisible();
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

  test('the corner handle selects the whole table and the right button opens its menu', async ({
    page,
  }) => {
    await page.locator(cells).nth(4).hover();
    await page.locator('[data-inkbrick-part="table-grip"]').click();

    await expect(page.locator(`${cells}[data-cell-selected]`)).toHaveCount(9);
    await expect(page.locator(blockMenu)).toHaveCount(0);

    await page.locator('[data-inkbrick-part="table-grip"]').click({ button: 'right' });
    await expect(page.locator(blockMenu)).toBeVisible();
  });

  test('the handles stay on the row while the pointer moves over its boundary marker', async ({
    page,
  }) => {
    const cell = (await page.locator(cells).nth(4).boundingBox())!;

    await page.mouse.move(cell.x + 40, cell.y + cell.height / 2);

    const marker = page.locator('[data-inkbrick-part="row-insert"]').first();
    const box = (await marker.boundingBox())!;
    const grip = page.locator('[data-inkbrick-part="row-grip"]');
    const before = (await grip.boundingBox())!;

    // Верхний маркер лежит на границе строки: шаг по нему вверх заходит в предыдущую строку, но ручки остаются на месте.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2, box.y + 1, { steps: 4 });
    await page.waitForTimeout(150);

    const after = (await grip.boundingBox())!;

    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  });

  test('a hint tells that a click selects the table', async ({ page }) => {
    const cell = (await page.locator(cells).nth(4).boundingBox())!;

    await page.mouse.move(cell.x + 20, cell.y + 10);

    const grip = (await page.locator('[data-inkbrick-part="table-grip"]').boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 6 });

    const tip = page.locator('[data-inkbrick-part="tip"]:visible');

    await expect(tip).toHaveText('Click to select the table');
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

  // Касания с настоящей задержкой и протяжкой: только Chromium (CDP).
  test.describe('with a finger', () => {
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
    const centre = async (page: Page, index: number) => {
      const box = (await page.locator(cells).nth(index).boundingBox())!;

      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const picked = (page: Page) => page.locator(`${cells}[data-cell-selected]`).count();

    test.beforeEach(async ({ page }) => {
      await page.goto('/?lang=en');
      await insertTable(page);
      // Каретка в таблице не нужна: начинаем с пустого выделения.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    });

    test('a long press selects a cell and a drag extends it, releasing does not open the menu', async ({
      page,
    }) => {
      const touch = await finger(page);
      const from = await centre(page, 0);
      const to = await centre(page, 4);

      await touch.down(from.x, from.y);
      await page.waitForTimeout(700);
      expect(await picked(page)).toBe(1);

      await touch.move((from.x + to.x) / 2, (from.y + to.y) / 2);
      await touch.move(to.x, to.y);
      await expect.poll(() => picked(page)).toBe(4);
      // Страница при протяжке не прокручивается.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      await touch.up();
      await page.waitForTimeout(400);
      // Палец отпущен, чтобы подправить выделение: меню не открывается, рамка с точкой остаётся.
      expect(await picked(page)).toBe(4);
      await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);
      await expect(page.locator('[data-inkbrick-part="cell-knob"]')).toBeVisible();
    });

    test('a long hold on a selected cell opens the menu, a quick tap on it drops the selection', async ({
      page,
    }) => {
      const touch = await finger(page);
      const at = await centre(page, 4);

      await touch.down(at.x, at.y);
      await page.waitForTimeout(700);
      await touch.up();
      await page.waitForTimeout(400);
      expect(await picked(page)).toBe(1);

      // Короткое удержание меню не открывает, долгое — открывает (и остаётся после отпускания).
      await touch.down(at.x, at.y);
      await page.waitForTimeout(250);
      await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);
      await page.waitForTimeout(450);
      await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
      await touch.up();
      await page.waitForTimeout(400);
      await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
      expect(await picked(page)).toBe(1);

      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);

      // Короткое касание выделенной ячейки снимает выделение.
      await touch.down(at.x, at.y);
      await page.waitForTimeout(80);
      await touch.up();
      await expect.poll(() => picked(page)).toBe(0);
    });

    test('a quick tap and a finger that scrolls select nothing', async ({ page }) => {
      const touch = await finger(page);
      const at = await centre(page, 4);

      await touch.down(at.x, at.y);
      await page.waitForTimeout(100);
      await touch.up();
      await page.waitForTimeout(600);
      expect(await picked(page)).toBe(0);

      await touch.down(at.x, at.y);
      await touch.move(at.x, at.y + 40);
      await page.waitForTimeout(700);
      await touch.up();
      expect(await picked(page)).toBe(0);
      await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);
    });

    test('a tap shows a frame with a knob; dragging the knob selects a rectangle', async ({
      page,
    }) => {
      await page.locator(cells).nth(4).tap();

      const knob = page.locator('[data-inkbrick-part="cell-knob"]');

      await expect(page.locator('[data-inkbrick-part="cell-frame"]')).toBeVisible();
      await expect(knob).toBeVisible();

      const handle = (await knob.boundingBox())!;
      const last = (await page.locator(cells).nth(8).boundingBox())!;
      const touch = await finger(page);

      await touch.down(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await touch.move(last.x + last.width - 4, last.y + last.height - 4);
      await expect.poll(() => picked(page)).toBe(4);
      await touch.up();
      await page.waitForTimeout(400);
      // Палец отпущен: выделение осталось, меню не открылось (его открывает долгое удержание).
      expect(await picked(page)).toBe(4);
      await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);
    });

    test('there is no corner table button on a phone: the table menu is in the cell menu', async ({
      page,
    }) => {
      await page.locator(cells).nth(4).tap();
      await expect(page.locator('[data-inkbrick-part="column-grip"]')).toBeVisible();
      await expect(page.locator('[data-inkbrick-part="table-grip"]')).toHaveCount(0);
    });

    test('on a phone the menus are bottom sheets: a backdrop closes them, a nested panel stacks with Back', async ({
      page,
    }) => {
      const touch = await finger(page);
      const at = await centre(page, 4);
      const menu = page.locator('[data-testid="context-menu"]');

      await touch.down(at.x, at.y);
      await page.waitForTimeout(700);
      await touch.up();
      await page.waitForTimeout(400);
      await touch.down(at.x, at.y);
      await page.waitForTimeout(700);
      await touch.up();
      await expect(menu).toBeVisible();
      await page.mouse.move(1, 1);
      await page.waitForTimeout(350);

      // Лист: во всю ширину, прижат к низу окна, за ним затемнение.
      expect(await menu.getAttribute('data-sheet')).not.toBeNull();
      const box = (await menu.boundingBox())!;
      const size = page.viewportSize()!;

      expect(box.x).toBe(0);
      expect(Math.round(box.width)).toBe(size.width);
      expect(Math.round(box.y + box.height)).toBe(size.height);
      await expect(page.locator('[data-inkbrick-part="sheet-backdrop"]')).toBeVisible();

      // Вложенная панель — второй лист с кнопкой «Назад».
      await menu
        .locator('[data-action="table-cell-borders"]')
        .evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await menu.locator('[data-action="table-cell-borders"]').tap();

      const flyout = page.locator('[data-inkbrick-part="flyout"]');

      await expect(flyout).toBeVisible();
      await flyout.locator('[data-inkbrick-part="sheet-back"]').tap();
      await expect(flyout).toHaveCount(0);
      await expect(menu).toBeVisible();

      // Касание затемнения закрывает меню и не доходит до документа: выделение остаётся.
      await page.touchscreen.tap(size.width / 2, 40);
      await expect(menu).toHaveCount(0);
      expect(await picked(page)).toBe(1);
      // Отмена ничего не фокусирует: документ не получает каретку, экранная клавиатура не поднимается.
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute('contenteditable') ?? null),
      ).toBeNull();
    });

    test('the cell menu with the table sections fits the screen and has big enough buttons', async ({
      page,
    }) => {
      const touch = await finger(page);
      const at = await centre(page, 4);

      // Первое удержание выделяет ячейку, второе, на выделенной, открывает меню.
      await touch.down(at.x, at.y);
      await page.waitForTimeout(700);
      await touch.up();
      await page.waitForTimeout(400);
      await touch.down(at.x, at.y);
      await page.waitForTimeout(700);
      await touch.up();

      const menu = page.locator('[data-testid="context-menu"]');

      await expect(menu).toBeVisible();
      // Мышиные события после отпускания гасятся на долю секунды: тап по пункту ждёт их конца. Виртуальная мышь
      // Playwright уходит с меню: на телефоне её нет, а над меню она «наводилась» бы на соседние пункты.
      await page.mouse.move(1, 1);
      await page.waitForTimeout(350);

      const inside = (locator: typeof menu) =>
        locator.evaluate((node) => {
          const box = node.getBoundingClientRect();

          return box.left >= 0 && box.right <= window.innerWidth && box.top >= 0;
        });

      expect(await inside(menu)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      );

      // Границы ячеек открываются отдельной панелью: она тоже помещается в окно, кнопки не меньше 44 пикселей.
      // Пункт ниже видимой части: меню прокручивается само (как пальцем), прокрутка страницы закрыла бы его.
      await menu
        .locator('[data-action="table-cell-borders"]')
        .evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await menu.locator('[data-action="table-cell-borders"]').tap();

      const flyout = page.locator('[data-inkbrick-part="flyout"]');

      await expect(flyout).toBeVisible();
      expect(await inside(flyout)).toBe(true);
      expect(
        (await flyout.locator('[data-action="table-border-all"]').boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);

      await flyout.locator('[data-action="table-border-all"]').tap();
      expect(await cellBorder(page, 4, 'top')).toBe('thin');
    });

    test('the width slider resizes the column live and writes one undo step on release', async ({
      page,
    }) => {
      const width = (index: number) =>
        page
          .locator(cells)
          .nth(index)
          .evaluate((node) => Math.round(node.getBoundingClientRect().width));
      const model = () =>
        page.evaluate(() => {
          const { editor } = (window as never as { __inkbrick: { main: { editor: never } } })
            .__inkbrick.main as never as {
            editor: { document: { rootId: string; getBlock: (id: string) => never } };
          };
          let found: { props: { widths?: number[] } } | undefined;
          const walk = (
            block: { flavour: string; children: string[]; props: never } | undefined,
          ) => {
            if (!block || found) return;
            if (block.flavour === 'block:table') found = block as never;
            block.children.forEach((id) => walk(editor.document.getBlock(id)));
          };

          walk(editor.document.getBlock(editor.document.rootId));

          return found?.props.widths ?? null;
        });

      await page.locator(cells).nth(1).tap();
      await page.locator('[data-inkbrick-part="column-grip"]').first().tap();
      await page.locator('[data-action="column-width-slider"]').tap();

      const bar = page.locator('[data-inkbrick-ui="column-width-bar"]');
      const slider = bar.locator('input[type="range"]');

      await expect(bar).toBeVisible();

      const before = await width(1);
      const box = (await slider.boundingBox())!;
      const touch = await finger(page);
      const y = box.y + box.height / 2;
      const min = Number(await slider.getAttribute('min'));
      const max = Number(await slider.getAttribute('max'));
      const start = box.x + box.width * ((Number(await slider.inputValue()) - min) / (max - min));

      await touch.down(start, y);
      await touch.move(start + 30, y);
      await touch.move(start + 60, y);

      // Живой предпросмотр: столбец уже шире, а документ ещё не записан.
      await expect.poll(() => width(1)).toBeGreaterThan(before + 10);
      expect(await model()).toBeNull();

      await touch.up();
      await expect.poll(model).not.toBeNull();

      // «Готово» закрывает панель, одна отмена возвращает ширины.
      await bar.locator('[data-action="column-width-done"]').tap();
      await expect(bar).toHaveCount(0);
      await page.getByRole('button', { name: /Undo/ }).tap();
      await expect.poll(model).toBeNull();
    });
  });
});
