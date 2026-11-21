import { test, expect, type Page } from '@playwright/test';

import { requireCdp } from './sandbox';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const part = (name: string) => `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${name}"]`;
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

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

async function hover(page: Page, index: number) {
  const box = (await page.locator(cells).nth(index).boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

const model = (page: Page) =>
  page.evaluate(() => {
    type Block = { flavour: string; children: string[]; content: { insert: string }[] };
    const { editor } = (
      window as never as {
        __inkbrick: {
          main: { editor: { document: { rootId: string; getBlock: (id: string) => Block } } };
        };
      }
    ).__inkbrick.main;
    const out: string[] = [];
    const walk = (id: string) => {
      const block = editor.document.getBlock(id);

      if (block.flavour === 'block:table-cell')
        out.push(block.content.map((n) => n.insert).join(''));
      block.children.forEach(walk);
    };

    walk(editor.document.rootId);

    return out;
  });

const rows = (page: Page) => page.locator(`${table} tr`).count();
const columns = (page: Page) => page.locator(`${table} tr`).first().locator('td').count();

test.describe('Table menus under impatient clicks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);
  });

  for (const [name, grip, count, change] of [
    ['Insert row below', 'row-grip', rows, 1],
    ['Delete row', 'row-grip', rows, -1],
    ['Insert column right', 'column-grip', columns, 1],
    ['Delete column', 'column-grip', columns, -1],
  ] as const) {
    test(`a double click on «${name}» does it once, and one undo takes it back`, async ({
      page,
    }) => {
      const before = await count(page);

      await hover(page, 4);
      await page.locator(part(grip)).click();
      await page.getByRole('menuitem', { name, exact: true }).dblclick();

      await expect.poll(() => count(page)).toBe(before + change);

      // Второй щелчок не попал ни во что опасное: меню закрыто, документ в порядке.
      await expect(page.locator('[data-inkbrick-ui="block-menu"]')).toHaveCount(0);

      await page.locator(cells).first().locator(editable).click();
      await page.keyboard.press(`${modifier}+z`);
      await expect.poll(() => count(page)).toBe(before);
    });
  }

  test('a double click on «Merge cells» in the cell menu merges once', async ({ page }) => {
    const a = (await page.locator(cells).nth(0).boundingBox())!;
    const b = (await page.locator(cells).nth(4).boundingBox())!;

    await page.mouse.move(a.x + 6, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Merge cells' }).dblclick();

    await expect(page.locator(`${cells}:visible`)).toHaveCount(6);
    expect((await model(page))[0]).toBe('r0c0\nr0c1\nr1c0\nr1c1');

    // Один шаг отмены возвращает сетку целиком.
    await page.locator(cells).nth(8).locator(editable).click();
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(`${cells}:visible`)).toHaveCount(9);
  });
});

test.describe('Composing text (IME) in a table cell', () => {
  test.beforeEach(({ page }) => requireCdp(page));

  const compose = async (page: Page, word: string) => {
    const cdp = await page.context().newCDPSession(page);

    for (let i = 1; i <= word.length; i++) {
      const part = word.slice(0, i);

      await cdp.send('Input.imeSetComposition', {
        text: part,
        selectionStart: part.length,
        selectionEnd: part.length,
      });
    }
    await cdp.send('Input.insertText', { text: word });
    await cdp.detach();
  };

  test('composed words land in the cell, the table controls redraw does not break them', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await insertTable(page);

    const target = page.locator(cells).nth(4).locator(editable);

    await target.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' ');
    // Наведение посередине составления: ручки таблицы перерисовываются, составление не рвётся.
    await hover(page, 4);
    await compose(page, '日本');
    await hover(page, 8);
    await compose(page, '語');

    await expect(target).toHaveText('r1c1 日本語');
    expect((await model(page))[4]).toBe('r1c1 日本語');
    // Соседние ячейки не задеты.
    expect((await model(page))[3]).toBe('r1c0');
    expect((await model(page))[5]).toBe('r1c2');
  });

  test('a composed word in a merged cell and Tab after it', async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);

    const a = (await page.locator(cells).nth(0).boundingBox())!;
    const b = (await page.locator(cells).nth(1).boundingBox())!;

    await page.mouse.move(a.x + 6, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Merge cells' }).click();

    await page.locator(cells).first().locator(editable).click();
    await page.keyboard.press('End');
    await compose(page, 'かな');
    await page.keyboard.press('Tab');
    await page.keyboard.type('x');

    const cellsText = await model(page);

    expect(cellsText[0]).toContain('かな');
    expect(cellsText[2]).toBe('r0c2x');
  });
});
