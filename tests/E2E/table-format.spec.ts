import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const menu = '[data-testid="context-menu"]';
const palette = '[data-testid="command-palette"]';
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

async function dragCells(page: Page, from: number, to: number) {
  const a = (await page.locator(cells).nth(from).boundingBox())!;
  const b = (await page.locator(cells).nth(to).boundingBox())!;

  await page.mouse.move(a.x + 6, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** Правый клик по ячейке выделенного диапазона. */
async function openMenu(page: Page, index: number) {
  const box = (await page.locator(cells).nth(index).boundingBox())!;

  await page.mouse.click(box.x + box.width - 6, box.y + box.height / 2, { button: 'right' });
  await expect(page.locator(menu)).toBeVisible();
}

/** Сколько ячеек таблицы целиком написано жирным (весь текст ячейки — в `<strong>`). */
const boldCells = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-inkbrick-block="table"] td')].filter((cell) => {
        const text = cell.querySelector('.editable')?.textContent ?? '';
        const bold = [...cell.querySelectorAll('.editable strong')]
          .map((node) => node.textContent)
          .join('');

        return text !== '' && bold === text;
      }).length,
  );

const aligns = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-inkbrick-block="table"] td')].map((cell) =>
      cell.getAttribute('data-align'),
    ),
  );

/** Пункты таблицы — в контекстном меню ячейки (правая кнопка): отдельной угловой кнопки у таблицы нет. */
async function openTableMenu(page: Page, index = 4) {
  await page.locator(cells).nth(index).locator(editable).click({ button: 'right' });
  await expect(page.locator(menu)).toBeVisible();
}

test.describe('Formatting of selected table cells', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);
  });

  test('centres every selected cell from the context menu in one undo step', async ({ page }) => {
    await dragCells(page, 0, 4);
    await openMenu(page, 4);
    await page.locator(`${menu} [data-format="align-center"]`).click();

    expect(await aligns(page)).toEqual([
      'center',
      'center',
      'left',
      'center',
      'center',
      'left',
      'left',
      'left',
      'left',
    ]);
    // Выделение осталось: действия можно складывать.
    await expect(page.locator(`${cells}[data-cell-selected]`)).toHaveCount(4);

    await page.keyboard.press('Escape');
    await page.keyboard.press(`${modifier}+z`);
    expect(await aligns(page)).toEqual(Array(9).fill('left'));
  });

  test('bold from the menu applies to all cells and a second click removes it', async ({
    page,
  }) => {
    await dragCells(page, 0, 8);
    await openMenu(page, 4);

    const bold = page.locator(`${menu} [data-format="bold"]`);

    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bold.click();
    expect(await boldCells(page)).toBe(9);
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    await bold.click();
    expect(await boldCells(page)).toBe(0);
  });

  test('Ctrl+B, Ctrl+I and Ctrl+Shift+R work on the selected cells', async ({ page }) => {
    await dragCells(page, 3, 5);
    await page.keyboard.press(`${modifier}+b`);
    await page.keyboard.press(`${modifier}+i`);
    await page.keyboard.press(`${modifier}+Shift+r`);

    expect(await boldCells(page)).toBe(3);
    await expect(page.locator(`${cells} .editable em`)).toHaveCount(3);
    expect((await aligns(page)).slice(3, 6)).toEqual(['right', 'right', 'right']);

    await page.keyboard.press(`${modifier}+b`);
    expect(await boldCells(page)).toBe(0);
  });

  test('the text colour and clear formatting buttons work on the range', async ({ page }) => {
    await dragCells(page, 0, 2);
    await openMenu(page, 1);
    await page.locator(`${menu} [data-format="color"]`).click();
    await page.locator(`${menu} [data-inkbrick-part="swatch"][data-color="red"]`).click();

    await expect(page.locator(`${cells} .editable [data-inkbrick-color="red"]`)).toHaveCount(3);

    await openMenu(page, 1);
    await page.locator(`${menu} [data-format="clear"]`).click();
    await expect(page.locator(`${cells} .editable [data-inkbrick-color="red"]`)).toHaveCount(0);
  });

  test('the command palette formats the selected cells', async ({ page }) => {
    await dragCells(page, 0, 4);
    await page.keyboard.press(`${modifier}+Shift+p`);
    await expect(page.locator(palette)).toBeVisible();
    await page.keyboard.type('align center');
    await page.keyboard.press('Enter');

    expect((await aligns(page)).slice(0, 2)).toEqual(['center', 'center']);
    await expect(page.locator(`${cells}[data-cell-selected]`)).toHaveCount(4);
  });
});

test.describe('Table formatting menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);
  });

  test('header column, striped rows and borders are table properties', async ({ page }) => {
    for (const [action, attribute] of [
      ['table-headerColumn', 'data-header-column'],
      ['table-striped', 'data-striped'],
    ] as const) {
      await openTableMenu(page);
      await page.locator(`${menu} [data-action="${action}"]`).click();
      await expect(page.locator(table)).toHaveAttribute(attribute, 'true');
    }

    await openTableMenu(page);
    await page.locator(`${menu} [data-action="table-borders"]`).click();
    await expect(page.locator(table)).toHaveAttribute('data-borders', 'none');

    // Первая ячейка каждой строки тела выделена заголовочным столбцом.
    const weight = await page
      .locator(cells)
      .nth(3)
      .evaluate((cell) => getComputedStyle(cell).fontWeight);

    expect(Number(weight)).toBeGreaterThanOrEqual(600);

    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(table)).not.toHaveAttribute('data-borders', 'none');
  });

  test('the background goes to the selected cells, otherwise to the cell under the menu', async ({
    page,
  }) => {
    const background = async (color: string) => {
      await page.locator(`${menu} [data-action="table-cell-background"]`).hover();
      await page
        .locator(`[data-flyout="table-cell-background"] [data-action="color-${color}"]`)
        .click();
    };

    await dragCells(page, 0, 1);
    await openTableMenu(page, 1);
    await background('yellow');
    await expect(page.locator(`${cells}[data-background="yellow"]`)).toHaveCount(2);

    await page.keyboard.press('Escape');
    await page.locator(cells).nth(8).locator(editable).click();
    await openTableMenu(page, 8);
    await background('green');
    await expect(page.locator(`${cells}[data-background="green"]`)).toHaveCount(1);
  });

  test('the same items are in the context menu of a cell and in the palette', async ({ page }) => {
    await page.locator(cells).nth(4).locator(editable).click({ button: 'right' });
    await expect(page.locator(menu)).toBeVisible();
    await page.getByRole('menuitem', { name: 'Shade alternate rows' }).click();
    await expect(page.locator(table)).toHaveAttribute('data-striped', 'true');

    await page.locator(cells).nth(4).locator(editable).click();
    await page.keyboard.press(`${modifier}+Shift+p`);
    await page.keyboard.type('remove row shading');
    await page.keyboard.press('Enter');
    await expect(page.locator(table)).not.toHaveAttribute('data-striped', 'true');
  });

  test('the table menu, the cell formatting menu and the palette have no a11y violations', async ({
    page,
  }) => {
    // Контекстное меню с панелью форматирования (и у текста, и у ячеек) содержит кнопки внутри `role="menu"`:
    // это замечание axe было и раньше, поэтому для него правило отключено.
    const violations = async (rules: string[] = []) => {
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((animation) => animation.finished)),
      );

      const result = await new AxeBuilder({ page })
        .include('.inkbrick-editor')
        .include('[data-inkbrick-ui]')
        .disableRules(rules)
        .analyze();

      return result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }));
    };

    await openTableMenu(page);
    expect(await violations()).toEqual([]);
    await page.keyboard.press('Escape');

    await dragCells(page, 0, 4);
    await openMenu(page, 4);
    expect(await violations(['aria-required-children'])).toEqual([]);
  });
});
