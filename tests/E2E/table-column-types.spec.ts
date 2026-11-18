import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const table = '[data-inkbrick-block="table"]';
const cells = `${table} td`;
const part = (name: string) => `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${name}"]`;
const dialog = '[data-testid="column-properties"]';

/** Абзац и под ним таблица 3×3 из slash-меню: в первом столбце «Name», «a», «b». */
async function insertTable(page: Page) {
  await page.locator(editable).first().click();
  await page.keyboard.type('before');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');

  const texts = ['Name', 'State', 'Mail', 'a', '', 'a@b.co', 'b', '', 'oops'];

  for (const [i, text] of texts.entries()) {
    if (text) await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Tab');
  }
}

async function openProperties(page: Page, row: number, column: number) {
  const box = (await page
    .locator(cells)
    .nth(row * 3 + column)
    .boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator(part('column-grip')).click();
  await page.getByRole('menuitem', { name: 'Column properties…' }).click();
  await expect(page.locator(dialog)).toBeVisible();
}

test.describe('Table column types', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await insertTable(page);
    await page.mouse.move(2, 2);
  });

  test('a select column gets options in the dialog and a value from the picker', async ({
    page,
  }) => {
    await openProperties(page, 1, 1);
    await page.locator(`${dialog} [data-inkbrick-part="type"]`).selectOption('select');

    for (const name of ['Open', 'Closed']) {
      await page.locator(`${dialog} [data-inkbrick-part="add"]`).click();
      await page.locator(`${dialog} [data-inkbrick-part="label"]`).last().fill(name);
    }

    await page.locator(`${dialog} [data-inkbrick-part="color"]`).first().selectOption('green');
    await page.locator(`${dialog} [data-inkbrick-part="apply"]`).click();
    await expect(page.locator(dialog)).toBeHidden();

    await page.locator(cells).nth(4).locator('[data-inkbrick-part="cell-chips"]').click();
    await page.getByRole('option', { name: 'Open' }).click();

    const chip = page.locator(cells).nth(4).locator('[data-inkbrick-part="chip"]');

    await expect(chip).toHaveText('Open');
    await expect(chip).toHaveAttribute('data-color', 'green');
    // Заголовок остаётся текстом.
    await expect(page.locator(cells).nth(1).locator('[data-inkbrick-part="chip"]')).toHaveCount(0);

    await page.keyboard.press('Control+z');
    await expect(page.locator(cells).nth(4).locator('[data-inkbrick-part="chip"]')).toHaveCount(0);
  });

  test('a checkbox column toggles on click', async ({ page }) => {
    await openProperties(page, 1, 1);
    await page.locator(`${dialog} [data-inkbrick-part="type"]`).selectOption('checkbox');
    await page.locator(`${dialog} [data-inkbrick-part="apply"]`).click();

    const box = page.locator(cells).nth(4).locator('input[type="checkbox"]');

    await box.check();
    await expect(box).toBeChecked();
    await expect(page.locator(cells).nth(4).locator(editable)).toHaveText('true');

    await box.uncheck();
    await expect(page.locator(cells).nth(4).locator(editable)).toHaveText('');
  });

  test('Space and Enter toggle a checkbox cell from the keyboard', async ({ page }) => {
    await openProperties(page, 1, 1);
    await page.locator(`${dialog} [data-inkbrick-part="type"]`).selectOption('checkbox');
    await page.locator(`${dialog} [data-inkbrick-part="apply"]`).click();

    // Каретка в ячейке слева, Tab переходит в ячейку-флажок.
    await page.locator(cells).nth(3).locator(editable).click();
    await page.keyboard.press('Tab');

    const box = page.locator(cells).nth(4).locator('input[type="checkbox"]');

    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    await expect(page.locator(cells).nth(4).locator(editable)).toHaveText('true');

    await page.keyboard.press('Enter');
    await expect(box).not.toBeChecked();
    // Enter не добавил строк: таблица осталась 3×3.
    await expect(page.locator(`${table} tr`)).toHaveCount(3);

    await page.keyboard.press('Space');
    await page.keyboard.press('Control+z');
    await expect(box).not.toBeChecked();
  });

  test('a select cell opens from the keyboard, arrows choose, Enter picks, Ctrl+Z undoes', async ({
    page,
  }) => {
    await openProperties(page, 1, 1);
    await page.locator(`${dialog} [data-inkbrick-part="type"]`).selectOption('select');

    for (const name of ['Open', 'Closed']) {
      await page.locator(`${dialog} [data-inkbrick-part="add"]`).click();
      await page.locator(`${dialog} [data-inkbrick-part="label"]`).last().fill(name);
    }

    await page.locator(`${dialog} [data-inkbrick-part="apply"]`).click();
    await expect(page.locator(dialog)).toBeHidden();

    await page.locator(cells).nth(3).locator(editable).click();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeHidden();

    const chip = page.locator(cells).nth(4).locator('[data-inkbrick-part="chip"]');

    await expect(chip).toHaveText('Closed');

    // Каретка вернулась в ячейку: Ctrl+Z работает сразу, Alt+↓ открывает список снова, Esc закрывает.
    await page.keyboard.press('Control+z');
    await expect(chip).toHaveCount(0);
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
  });

  test('an email column links valid addresses and flags the others', async ({ page }) => {
    await openProperties(page, 1, 2);
    await page.locator(`${dialog} [data-inkbrick-part="type"]`).selectOption('email');
    await page.locator(`${dialog} [data-inkbrick-part="apply"]`).click();

    await expect(page.locator(cells).nth(5).locator('a')).toHaveAttribute('href', 'mailto:a@b.co');
    await expect(
      page.locator(cells).nth(8).locator('[data-inkbrick-part="cell-invalid"]'),
    ).toBeVisible();
  });
});
