import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function reset(page: Page) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');
}

test.describe('Slash items of the app blocks follow the language', () => {
  test('the counter is "Counter" in English and "Счётчик" in Russian, found by both words', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await reset(page);
    await page.keyboard.type('/count');

    const item = page.locator('[data-slash-item="counter"]');

    await expect(item).toContainText('Counter');
    await expect(item).toContainText('Number with + and − buttons');

    await page.goto('/?lang=ru');
    await reset(page);
    await page.keyboard.type('/счёт');

    await expect(page.locator('[data-slash-item="counter"]')).toContainText('Счётчик');
    await expect(page.locator('[data-slash-item="counter"]')).toContainText('Число с кнопками');

    // Английские слова остаются в поиске.
    await page.keyboard.press('Escape');
    await reset(page);
    await page.keyboard.type('/count');
    await expect(page.locator('[data-slash-item="counter"]')).toBeVisible();
  });
});

test.describe('Backspace and Delete next to a folded section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await reset(page);
    // Раздел «One» с абзацем и следующий заголовок «Two».
    await page.keyboard.type('# One');
    await page.keyboard.press('Enter');
    await page.keyboard.type('inside');
    await page.keyboard.press('Enter');
    await page.keyboard.type('# Two');
    await page
      .locator('[data-inkbrick-block="heading"] [data-inkbrick-part="fold"]')
      .first()
      .click();
    await expect(page.locator(editable)).toHaveCount(2);
  });

  test('Backspace at the start of the block under the section unfolds it, the next press merges as usual', async ({
    page,
  }) => {
    await page.locator(editable).nth(1).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');

    await expect(page.locator(editable)).toHaveCount(3);
    await expect(page.locator(editable).nth(1)).toHaveText('inside');
    await expect(page.locator(editable).nth(2)).toHaveText('Two');
    await expect(page.locator('[data-inkbrick-block="heading"]')).toHaveCount(2);

    await page.keyboard.press('Backspace');
    await expect(page.locator('[data-inkbrick-block="heading"]')).toHaveCount(1);
  });

  test('Delete at the end of the folded heading unfolds the section first', async ({ page }) => {
    await page.locator(editable).first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Delete');

    await expect(page.locator(editable)).toHaveCount(3);
    await expect(page.locator(editable).first()).toHaveText('One');
    await expect(page.locator(editable).nth(1)).toHaveText('inside');
  });
});
