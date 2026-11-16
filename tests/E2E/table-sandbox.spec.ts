import { test, expect, type Page } from '@playwright/test';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const cells = '[data-inkbrick-block="table"] td';
const rows = '[data-inkbrick-block="table"] tr';

async function tool(page: Page, id: string) {
  await page.getByTestId('tools-menu').click();
  await page.getByTestId(id).click();
}

test.describe('Table editor playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo=table&lang=en');
    await expect(page.locator(cells)).toHaveCount(6);
  });

  test('loads sample, random, large and empty data', async ({ page }) => {
    await tool(page, 'table-random');
    await expect(page.locator(cells)).toHaveCount(13 * 4);

    await tool(page, 'table-large');
    await expect(page.locator(cells)).toHaveCount(100 * 12);

    await tool(page, 'table-clear');
    await expect(page.locator(cells)).toHaveCount(9);

    await tool(page, 'table-sample');
    await expect(page.locator(cells)).toHaveCount(6);
  });

  test('adds ten filled rows in one undo step', async ({ page }) => {
    await tool(page, 'table-add-rows');

    await expect(page.locator(rows)).toHaveCount(13);
    await expect(page.locator(`${rows}:nth-child(5) td`).first()).not.toHaveText('');

    await page.locator(cells).first().click();
    await page.keyboard.press(`${modifier}+z`);

    await expect(page.locator(rows)).toHaveCount(3);
  });

  test('read mode stops editing and the debug panel shows the document', async ({ page }) => {
    await page.getByTestId('mode-read').click();
    await page.locator(cells).nth(1).click();
    await page.keyboard.type('zzz');

    await expect(page.locator(cells).nth(1)).not.toContainText('zzz');

    await page.getByTestId('mode-edit').click();
    await tool(page, 'toggle-debug');

    await expect(page.getByTestId('debug-panel')).toContainText('table');
  });

  test('exports the table as a file and imports it back, and rejects a wrong file', async ({
    page,
  }) => {
    const download = page.waitForEvent('download');

    await tool(page, 'export-json');

    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^inkbrick-table-.*\.json$/);

    await page.getByTestId('import-file').setInputFiles({
      name: 'data.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          rows: [
            ['a', 'b', 'c'],
            ['1', '2', '3'],
          ],
        }),
      ),
    });

    await expect(page.locator(cells)).toHaveCount(6);
    await expect(page.locator(cells).nth(2)).toHaveText('c');
    await expect(page.getByTestId('notice')).toContainText('data.json');

    await page.getByTestId('import-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"nope": 1}'),
    });

    await expect(page.getByTestId('notice')).toContainText('not a table');
    await expect(page.locator(cells).nth(2)).toHaveText('c');
  });
});

test.describe('Playground localization', () => {
  test('the table page and the switch are in Russian and keep the language', async ({ page }) => {
    await page.goto('/?demo=table&lang=ru');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Редактор таблицы');
    await expect(page.getByTestId('demo-editor')).toHaveText('Редактор');
    await expect(page.getByTestId('mode-read')).toHaveText('Чтение');

    await page.getByTestId('tools-menu').click();
    await expect(page.getByTestId('table-random')).toContainText('Случайные данные');

    await page.getByTestId('demo-editor').click();
    await expect(page).toHaveURL(/lang=ru/);
    await expect(page.getByTestId('demo-table')).toHaveText('Редактор таблицы');
  });

  test('the counter block is translated', async ({ page }) => {
    await page.goto('/?lang=ru');
    await page.locator('.editable').first().click();
    await page.keyboard.type('/counter');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('counter-inc')).toHaveAttribute('aria-label', 'Увеличить');
  });
});
