import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const popup = '[data-testid="tag-suggestions"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function fresh(page: Page, lang = 'en') {
  await page.goto(`/?lang=${lang}`);
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');
}

const highlighted = (page: Page) =>
  page.evaluate(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, Set<Range>> }).highlights;

    return [...(registry?.get('inkbrick-tag') ?? [])].map((range) => range.toString());
  });

test.describe('Tags', () => {
  test('are highlighted in the text, and the text stays what it is', async ({ page }) => {
    await fresh(page);
    await page.keyboard.type('a #idea b #to-do c #123 d');

    await expect.poll(() => highlighted(page)).toEqual(['#idea', '#to-do']);
    await expect(page.locator(editable).first()).toHaveText('a #idea b #to-do c #123 d');
  });

  test('typing # offers the tags of the document; Enter completes the one under the cursor', async ({
    page,
  }) => {
    await fresh(page);
    await page.keyboard.type('#project #personal');
    await page.keyboard.press('Enter');
    await page.keyboard.type('#pro');

    await expect(page.locator(popup)).toBeVisible();
    await expect(page.locator(`${popup} [role="option"]`)).toHaveText(['#project']);

    await page.keyboard.press('Enter');

    await expect(page.locator(editable).last()).toHaveText('#project');
    await expect(page.locator(popup)).toHaveCount(0);
    // Enter выбрал тег, а не разделил блок.
    await expect(page.locator(editable)).toHaveCount(2);
  });

  test('ArrowDown chooses, Escape closes the list and keeps what was typed', async ({ page }) => {
    await fresh(page);
    await page.keyboard.type('#alpha #apple');
    await page.keyboard.press('Enter');
    await page.keyboard.type('#a');

    await expect(page.locator(`${popup} [role="option"]`)).toHaveCount(2);

    await page.keyboard.press('ArrowDown');
    await expect(page.locator(`${popup} [aria-selected="true"]`)).toHaveText('#apple');

    await page.keyboard.press('Escape');
    await expect(page.locator(popup)).toHaveCount(0);
    await expect(page.locator(editable).last()).toHaveText('#a');
  });

  test('Ctrl+click on a tag reports it to the application; a plain click does not', async ({
    page,
  }) => {
    await fresh(page);
    await page.keyboard.type('see #idea here');

    const box = (await page.locator(editable).first().boundingBox())!;
    // «#idea» стоит после «see »: около четвёртого–девятого знака строки.
    const x = box.x + 52;
    const y = box.y + box.height / 2;

    await page.mouse.click(x, y);
    await expect(page.getByTestId('notice')).toHaveCount(0);

    await page.keyboard.down(modifier);
    await page.mouse.click(x, y);
    await page.keyboard.up(modifier);

    await expect(page.getByTestId('notice')).toContainText('#idea');
  });

  test('the suggestion list is named in Russian', async ({ page }) => {
    await fresh(page, 'ru');
    await page.keyboard.type('#проект');
    await page.keyboard.press('Enter');
    await page.keyboard.type('#про');

    await expect(page.getByRole('listbox', { name: 'Подсказки тегов' })).toBeVisible();
  });
});
