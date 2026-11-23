import { test, expect } from '@playwright/test';

/**
 * Варианты исправления в контекстном меню: песочница подключает `@inkbrick/spellcheck` (русский и английский словари в
 * Web Worker). Правый клик по слову с ошибкой — варианты над «Вырезать», выбор заменяет слово одним шагом отмены.
 */

const menu = '[data-inkbrick-ui="context-menu"]';

async function typeAndRightClick(
  page: import('@playwright/test').Page,
  text: string,
  word: string,
) {
  await page.goto('/?lang=ru');

  const editable = page.locator('.editable').first();

  await editable.click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);

  // Правый клик по середине слова.
  const box = await editable.evaluate((node, target) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);

    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      const index = current.textContent!.indexOf(target);

      if (index === -1) continue;

      const range = document.createRange();

      range.setStart(current, index + 1);
      range.setEnd(current, index + target.length - 1);

      const rect = range.getBoundingClientRect();

      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    return null;
  }, word);

  await page.mouse.click(box!.x, box!.y, { button: 'right' });
  await expect(page.locator(menu)).toBeVisible();
}

test('a misspelled Russian word: suggestions above Cut, picking one replaces the word', async ({
  page,
}) => {
  await typeAndRightClick(page, ' ошебка тут', 'ошебка');

  const fix = page.locator(`${menu} [data-action="spelling-0"]`);

  // Русский словарь грузится в Web Worker (пару секунд при первом слове).
  await expect(fix).toHaveText('ошибка', { timeout: 20_000 });
  await expect(page.locator(`${menu} [data-action="spelling-add"]`)).toBeVisible();

  await fix.click();
  await expect(page.locator(menu)).toHaveCount(0);
  await expect(page.locator('.editable').first()).toContainText('ошибка тут');

  await page.keyboard.press('Control+z');
  await expect(page.locator('.editable').first()).toContainText('ошебка тут');
});

test('a correct word shows no suggestions; «Add to dictionary» makes a word correct', async ({
  page,
}) => {
  await typeAndRightClick(page, ' hello', 'hello');
  await expect(page.locator(`${menu} [data-action="cut"]`)).toBeVisible();
  // Проверка закончилась, вариантов нет.
  await expect(page.locator(`${menu} [data-action^="spelling"]`)).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.keyboard.press('Escape');
  await typeAndRightClick(page, ' inkbrikk', 'inkbrikk');
  await page.locator(`${menu} [data-action="spelling-add"]`).click({ timeout: 20_000 });

  await typeAndRightClick(page, ' inkbrikk', 'inkbrikk');
  await expect(page.locator(`${menu} [data-action="cut"]`)).toBeVisible();
  await expect(page.locator(`${menu} [data-action^="spelling"]`)).toHaveCount(0, {
    timeout: 20_000,
  });
});
