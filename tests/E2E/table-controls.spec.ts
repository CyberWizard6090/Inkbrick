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

  test('the block tab sits left of the row handle: they never overlap', async ({ page }) => {
    // Первая строка: язычок блока стоит на её высоте, плашка строки — ровно там же, но правее.
    await hover(page, 0, 0);

    const tab = (await page
      .locator('[data-testid="block-handle"] [data-action="grip"]')
      .boundingBox())!;
    const row = (await page.locator(part('row-grip')).boundingBox())!;

    expect(tab.x + tab.width).toBeLessThanOrEqual(row.x);
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
    await hover(page, 0, 2);
    // Правый край последнего столбца тянем до упора: он растянется до края страницы.
    await drag(2, 3000);

    const third = await widthOf(2);

    // Окно сузили: отрисованные ширины подгоняются под страницу, модель не должна меняться.
    await page.setViewportSize({ width: 375, height: 700 });
    await hover(page, 0, 0);
    await drag(0, 20);

    await page.setViewportSize({ width: 900, height: 700 });
    await hover(page, 0, 0);

    expect(Math.abs((await widthOf(2)) - third)).toBeLessThan(2);
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
