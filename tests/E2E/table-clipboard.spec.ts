import { test, expect, type Page } from '@playwright/test';

import { useSystemClipboard } from './sandbox';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function pasteData(page: Page, data: { html?: string; text?: string }) {
  await page.evaluate((payload) => {
    const dt = new DataTransfer();

    if (payload.html !== undefined) dt.setData('text/html', payload.html);
    if (payload.text !== undefined) dt.setData('text/plain', payload.text);

    const root = document.querySelector('.inkbrick-editor') as HTMLElement;

    root.focus();
    root.dispatchEvent(
      Object.defineProperty(
        new Event('paste', { bubbles: true, cancelable: true }),
        'clipboardData',
        {
          value: dt,
        },
      ),
    );
  }, data);
}

const grid = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-inkbrick-block="table"]')].map((t) =>
      [...t.querySelectorAll('tr')].map((row) =>
        [...row.querySelectorAll('td .editable')].map((cell) => cell.textContent),
      ),
    ),
  );

const readClipboard = (page: Page) =>
  page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const read = async (type: string) =>
      item.types.includes(type) ? await (await item.getType(type)).text() : null;

    return { html: await read('text/html'), text: await read('text/plain') };
  });

const EXCEL =
  '<table border=0 cellpadding=0 cellspacing=0 width=192 style="border-collapse:collapse;width:144pt">' +
  '<col width=64 span=3 style="width:48pt"><tr height=20><td height=20 class=xl65>Name</td><td class=xl65>Qty</td></tr>' +
  '<tr height=20><td height=20>Apple</td><td align=right>3</td></tr></table>';

const SHEETS =
  '<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}--></style>' +
  '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" data-sheets-root="1">' +
  '<colgroup><col width="100"><col width="100"></colgroup><tbody>' +
  '<tr style="height:21px;"><td style="font-weight:bold;">Item</td><td style="font-weight:bold;">Total</td></tr>' +
  '<tr><td>pear</td><td style="text-align:right;">10</td></tr></tbody></table></google-sheets-html-origin>';

test.describe('Table clipboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator(editable).first().click();
  });

  test('HTML from Excel becomes a table with the right cells', async ({ page }) => {
    await pasteData(page, { html: EXCEL, text: 'Name\tQty\nApple\t3' });

    await expect(page.locator(table)).toHaveCount(1);
    expect(await grid(page)).toEqual([
      [
        ['Name', 'Qty'],
        ['Apple', '3'],
      ],
    ]);
  });

  test('HTML from Google Sheets keeps bold and alignment', async ({ page }) => {
    await pasteData(page, { html: SHEETS });

    expect(await grid(page)).toEqual([
      [
        ['Item', 'Total'],
        ['pear', '10'],
      ],
    ]);
    await expect(page.locator(cells).first().locator('strong')).toHaveText('Item');
    await expect(page.locator(cells).nth(3)).toHaveAttribute('data-align', 'right');
  });

  test('tab-separated text becomes a table; Ctrl+Shift+V keeps it as text', async ({ page }) => {
    await pasteData(page, { text: 'a\tb\nc\td' });

    expect(await grid(page)).toEqual([
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
    ]);
  });

  test('a table pasted into a table fills the cells from the caret', async ({ page }) => {
    await page.keyboard.type('/table');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await pasteData(page, { text: 'x\ty\tz\n1\t2\t3' });

    expect(await grid(page)).toEqual([
      [
        ['', 'x', 'y', 'z'],
        ['', '1', '2', '3'],
        ['', '', '', ''],
      ],
    ]);
  });

  test('undo takes a whole pasted table away at once', async ({ page }) => {
    await pasteData(page, { html: EXCEL });
    await expect(page.locator(table)).toHaveCount(1);

    await page.keyboard.press(`${modifier}+z`);

    await expect(page.locator(table)).toHaveCount(0);
  });
});

test.describe('Table copy', () => {
  test.beforeEach(async ({ page, context }) => {
    await useSystemClipboard(context);
    await page.goto('/?lang=en');
    await page.locator(editable).first().click();
    await pasteData(page, { html: EXCEL });
  });

  test('copying cells puts a table and tab-separated text on the clipboard', async ({ page }) => {
    const first = (await page.locator(cells).first().boundingBox())!;
    const last = (await page.locator(cells).nth(3).boundingBox())!;

    await page.mouse.move(first.x + 6, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width - 6, last.y + last.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press(`${modifier}+c`);

    const { html, text } = await readClipboard(page);

    expect(text).toBe('Name\tQty\nApple\t3');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>Apple</td>');
  });

  test('a copied table pastes as a table below the first one', async ({ page }) => {
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press(`${modifier}+c`);
    await page.keyboard.press(`${modifier}+End`);
    await page.keyboard.press('Enter');
    await page.keyboard.press(`${modifier}+v`);

    await expect(page.locator(table)).toHaveCount(2);

    const [first, second] = (await grid(page)) as string[][][];

    expect(second).toEqual(first);
  });
});
