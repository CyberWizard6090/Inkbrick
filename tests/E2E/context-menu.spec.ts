import { test, expect, type Page } from '@playwright/test';

import { useSystemClipboard } from './sandbox';

const editable = '.editable';
const menu = '[data-testid="context-menu"]';
const toolbar = '[data-testid="toolbar"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

/** Выделяет мышью (двойной клик) первое слово блока. */
async function selectFirstWord(page: Page, index: number) {
  const box = (await page.locator(editable).nth(index).boundingBox())!;

  await page.mouse.dblclick(box.x + 10, box.y + box.height / 2);
}

/** Правый клик по первому слову блока или (`end`) правее конца строки. */
async function rightClick(page: Page, index: number, where: 'start' | 'end' = 'start') {
  const box = (await page.locator(editable).nth(index).boundingBox())!;
  const x = where === 'start' ? box.x + 10 : box.x + box.width - 10;

  await page.mouse.click(x, box.y + box.height / 2, { button: 'right' });
}

const texts = (page: Page) => page.locator(editable).allTextContents();

test.describe('Context menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('a mouse selection shows no floating toolbar; the right click menu formats it', async ({
    page,
  }) => {
    await typeBlocks(page, ['bold me']);
    await selectFirstWord(page, 0);

    await expect(page.locator(toolbar)).toHaveCount(0);

    await rightClick(page, 0);
    await expect(page.locator(menu)).toBeVisible();
    await expect(page.locator(`${menu} ${toolbar}`)).toHaveAttribute('data-placement', 'inline');

    await page.locator(`${menu} [data-format="bold"]`).click();

    await expect(page.locator(`${editable} strong`)).toHaveText('bold');
    await expect(page.locator(`${menu} [data-format="bold"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.keyboard.press('Escape');
    await expect(page.locator(menu)).toHaveCount(0);
  });

  test('the link field works inside the menu', async ({ page }) => {
    await typeBlocks(page, ['link me']);
    await selectFirstWord(page, 0);
    await rightClick(page, 0);

    await page.locator(`${menu} [data-format="link"]`).click();
    await page.locator(`${menu} [data-inkbrick-part="input"]`).fill('example.com');
    await page.keyboard.press('Enter');

    await expect(page.locator(`${editable} a`)).toHaveAttribute('href', 'https://example.com');
  });

  test('without a selection it offers clipboard actions; a click outside closes it', async ({
    page,
  }) => {
    await typeBlocks(page, ['plain']);
    await rightClick(page, 0);

    await expect(page.locator(menu)).toBeVisible();
    await expect(page.locator(`${menu} ${toolbar}`)).toHaveCount(0);
    await expect(page.locator(`${menu} [data-action="copy"]`)).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await page.mouse.click(5, 5);
    await expect(page.locator(menu)).toHaveCount(0);
  });

  test('stays inside the window near its edge', async ({ page }) => {
    await typeBlocks(page, ['edge']);

    const size = page.viewportSize()!;
    const box = (await page.locator(editable).first().boundingBox())!;
    const height = Math.round(box.y + 80);

    // Окно чуть ниже первой строки: меню не помещается под точкой клика и открывается вверх.
    await page.setViewportSize({ width: size.width, height });
    // Событие resize закрывает меню — дожидаемся его до правого клика.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await rightClick(page, 0, 'end');

    const rect = (await page.locator(menu).boundingBox())!;

    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
  });

  test('Select all, Copy and Paste go through the editor clipboard', async ({ page, context }) => {
    await useSystemClipboard(context);
    await typeBlocks(page, ['one', 'two']);

    await rightClick(page, 0);
    await page.locator(`${menu} [data-action="selectAll"]`).click();

    await rightClick(page, 1);
    await page.locator(`${menu} [data-action="copy"]`).click();
    await expect(page.locator(menu)).toHaveCount(0);

    // Правый клик правее конца строки ставит туда курсор; вставка из меню.
    await page.locator(editable).nth(1).click();
    await rightClick(page, 1, 'end');
    await page.locator(`${menu} [data-action="paste"]`).click();

    await expect.poll(() => texts(page)).toEqual(['one', 'twoone', 'two']);
  });

  test('Ctrl+K opens the link field next to the selection', async ({ page }) => {
    await typeBlocks(page, ['link me']);
    await selectFirstWord(page, 0);
    await page.keyboard.press(`${modifier}+k`);

    await expect(page.locator(`${toolbar} [data-inkbrick-part="input"]`)).toBeVisible();
  });
});
