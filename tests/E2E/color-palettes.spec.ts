import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Палитра цветов — одного вида во всём редакторе: цвет текста и выделение (панель форматирования), фон блока (меню
 * блока), фон ячеек и цвет границ (меню таблицы). Везде одна сетка одинаковых скруглённых образцов: первый — «×», за ним
 * цвета палитры, последний — «Свой цвет…».
 */

const toolbar = '[data-inkbrick-ui="toolbar"]';
const contextMenu = '[data-inkbrick-ui="context-menu"]';

async function look(swatches: Locator) {
  await expect(swatches).toBeVisible();

  return swatches.evaluate((grid) => {
    const items = [...grid.querySelectorAll<HTMLElement>('[data-inkbrick-part="swatch"]')];
    const style = getComputedStyle(items[1]);

    return {
      first: items[0].getAttribute('data-color'),
      firstHasCross: items[0].querySelector('svg') !== null,
      last: items.at(-1)!.getAttribute('data-color'),
      width: style.width,
      height: style.height,
      radius: style.borderTopLeftRadius,
      // Все образцы одного размера.
      sameSize: items.every((item) => getComputedStyle(item).width === style.width),
    };
  });
}

async function formattingPanel(page: Page, format: 'color' | 'highlight') {
  await page.goto('/?lang=en&formatting=toolbar');
  await page.locator('.editable').first().click();
  await page.keyboard.type('tint');
  await page.keyboard.press('Shift+Home');
  await page.locator(`${toolbar} [data-format="${format}"]`).click();

  return page.locator(`${toolbar} [data-kind="${format}"] [data-inkbrick-part="swatches"]`);
}

async function blockMenu(page: Page) {
  await page.goto('/?lang=en');
  await page.locator('.editable').first().hover();
  await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();

  return page.getByTestId('block-menu').locator('[data-inkbrick-part="swatches"]');
}

async function tableFlyout(page: Page, path: readonly string[]) {
  await page.goto('/?demo=table&lang=en');

  const cell = page.locator('[data-inkbrick-block="table"] td').nth(4);

  await expect(cell).toBeVisible();

  const box = (await cell.boundingBox())!;

  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2, { button: 'right' });
  await expect(page.locator(contextMenu)).toBeVisible();

  for (const action of path) {
    await page.locator(`[data-action="${action}"]`).first().hover();
    await expect(page.locator(`[data-flyout="${action}"]`)).toBeVisible();
  }

  return page.locator(`[data-flyout="${path.at(-1)}"] [data-inkbrick-part="swatches"]`);
}

test('every colour palette has the same look: × first, «Custom color…» last, same swatch size and corners', async ({
  page,
}) => {
  const palettes = {
    text: await look(await formattingPanel(page, 'color')),
    highlight: await look(await formattingPanel(page, 'highlight')),
    block: await look(await blockMenu(page)),
    cell: await look(await tableFlyout(page, ['table-cell-background'])),
    border: await look(await tableFlyout(page, ['table-cell-borders', 'table-border-colorMenu'])),
  };
  const reference = palettes.block;

  for (const [where, palette] of Object.entries(palettes)) {
    expect(palette, where).toEqual({
      first: '',
      firstHasCross: true,
      last: 'custom',
      width: reference.width,
      height: reference.height,
      radius: reference.radius,
      sameSize: true,
    });
  }

  // Образцы — скруглённые квадраты, а не круги.
  expect(reference.width).toBe(reference.height);
  expect(reference.radius).not.toBe('50%');
  expect(parseFloat(reference.radius)).toBeLessThan(parseFloat(reference.width) / 2);
});

test('the palette inside the main context menu fits the menu: no horizontal scrollbar', async ({
  page,
}) => {
  await page.goto('/?lang=en');
  await page.locator('.editable').first().click();
  await page.keyboard.type('tint');
  await page.keyboard.press('Shift+Home');

  const box = (await page.locator('.editable').first().boundingBox())!;

  await page.mouse.click(box.x + 40, box.y + box.height / 2, { button: 'right' });

  const menu = page.locator(contextMenu);

  await menu.locator('[data-format="color"]').click();
  await expect(menu.locator('[data-inkbrick-part="swatches"]')).toBeVisible();

  const fits = await menu.evaluate((node) => node.scrollWidth <= node.clientWidth);

  expect(fits).toBe(true);
});

test('the main context menu keeps its width when the palette or «Turn into» opens; the list goes under the whole row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?lang=en');
  await page.locator('.editable').first().click();
  await page.keyboard.type('tint word');
  await page.keyboard.press('Shift+Home');

  const box = (await page.locator('.editable').first().boundingBox())!;

  await page.mouse.click(box.x + 20, box.y + box.height / 2, { button: 'right' });

  const menu = page.locator(contextMenu);
  const width = () => menu.evaluate((node) => node.getBoundingClientRect().width);
  const closed = await width();

  await menu.locator('[data-format="color"]').click();
  await expect(menu.locator('[data-inkbrick-part="swatches"]')).toBeVisible();
  expect(Math.abs((await width()) - closed)).toBeLessThanOrEqual(4);

  await menu.locator('[data-format="color"]').click();
  await menu.locator('[data-format="turn-into"]').click();

  const list = menu.locator('[data-inkbrick-part="turn-menu"]');

  await expect(list).toBeVisible();
  expect(Math.abs((await width()) - closed)).toBeLessThanOrEqual(4);

  // Все кнопки форматирования — в одном ряду над списком, а не после него.
  const listTop = (await list.boundingBox())!.y;
  const rows = await menu
    .locator('[data-inkbrick-ui="toolbar"] > button')
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));

  expect(new Set(rows.map(Math.round)).size).toBe(1);
  expect(Math.max(...rows)).toBeLessThan(listTop);
});
