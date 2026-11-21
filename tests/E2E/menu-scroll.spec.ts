import { test, expect, type Locator, type Page } from '@playwright/test';

import { useTool } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * Прокрутка всплывающего меню колесом: у конца списка колесо не уходит на страницу (она не прокручивается, меню не
 * закрывается и фокус остаётся в нём) — для каждого меню, которое прокручивается.
 */
async function scrollsInside(page: Page, list: Locator, menu: Locator = list) {
  await expect(list).toBeVisible();
  // Меню действительно прокручивается (иначе проверять нечего).
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 4)).toBe(true);

  const box = (await list.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // До конца списка…
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 400);
  await expect
    .poll(() =>
      list.evaluate((el) => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 1),
    )
    .toBe(true);

  const before = await page.evaluate(() => window.scrollY);

  // …и ещё: страница стоит, меню открыто.
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await expect(menu).toBeVisible();

  // То же вверх.
  for (let i = 0; i < 25; i++) await page.mouse.wheel(0, -400);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await expect(menu).toBeVisible();
}

test.describe('Menus keep the wheel to themselves at the end of their list', () => {
  // Низкое окно: меню длиннее экрана и прокручиваются; длинный документ: странице есть куда прокрутиться.
  test.use({ viewport: { width: 1100, height: 460 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await useTool(page, 'load-sample');
    // Страница прокручена на середину: ей есть куда уйти и вверх, и вниз.
    await page.evaluate(() => window.scrollTo(0, 400));
  });

  test('the slash menu', async ({ page }) => {
    const target = page.locator(editable).filter({ hasText: 'First paragraph' });

    await target.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');

    await scrollsInside(page, page.getByTestId('slash-menu'));
  });

  test('the context menu of a table cell', async ({ page }) => {
    const cell = page.locator('[data-inkbrick-block="table-cell"] .editable').first();

    await cell.scrollIntoViewIfNeeded();
    await cell.click({ button: 'right' });

    await scrollsInside(page, page.locator('[data-inkbrick-ui="context-menu"]').first());
  });

  test('the block menu', async ({ page }) => {
    const block = page.locator(editable).filter({ hasText: 'First paragraph' });

    await block.scrollIntoViewIfNeeded();
    await block.hover();
    await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();

    await scrollsInside(page, page.locator('[data-inkbrick-ui="block-menu"]').first());
  });

  test('the command palette', async ({ page }) => {
    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+Shift+p`);

    const palette = page.getByTestId('command-palette');

    await scrollsInside(page, palette.locator('[data-inkbrick-part="list"]'), palette);
  });

  test('the language list of a code block', async ({ page }) => {
    const language = page
      .locator('[data-inkbrick-block="code"] [data-inkbrick-part="language"]')
      .first();

    await language.scrollIntoViewIfNeeded();
    await language.click();

    await scrollsInside(page, page.locator('[data-inkbrick-ui="select"]'));
  });
});
