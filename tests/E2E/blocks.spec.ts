import { test, expect } from '@playwright/test';

import { useSystemClipboard } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Blocks, shortcuts and clipboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('markdown shortcut "## " turns a paragraph into a heading', async ({ page }) => {
    await page.keyboard.type('## Title');

    await expect(page.locator('.block-heading.level-2')).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('Title');
  });

  test('Enter after a heading creates a paragraph', async ({ page }) => {
    await page.keyboard.type('# Title');
    await page.keyboard.press('Enter');
    await page.keyboard.type('body');

    await expect(page.locator('.block-heading')).toHaveCount(1);
    await expect(page.locator('.block-paragraph')).toHaveText('body');
  });

  test('"- " creates a bullet list, Enter continues it, empty Enter exits it', async ({ page }) => {
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await expect(page.locator('.block-list[data-list-type="bullet"]')).toHaveCount(2);

    await page.keyboard.press('Enter'); // Enter в конце текста — новый пустой пункт
    await expect(page.locator('.block-list')).toHaveCount(3);

    await page.keyboard.press('Enter'); // Enter в пустом пункте — выход из списка
    await expect(page.locator('.block-list')).toHaveCount(2);
    await expect(page.locator('.block-paragraph')).toHaveCount(1);
  });

  test('Tab nests a list item and Shift+Tab lifts it back', async ({ page }) => {
    await page.keyboard.type('- parent');
    await page.keyboard.press('Enter');
    await page.keyboard.type('child');
    await page.keyboard.press('Tab');

    await expect(page.locator('.block-nested-children .block-list')).toHaveCount(1);
    await expect(page.locator('.block-nested-children .editable')).toHaveText('child');

    await page.keyboard.type('!');
    await expect(page.locator('.block-nested-children .editable')).toHaveText('child!');

    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.block-nested-children')).toHaveCount(0);
  });

  test('ordered list numbers items', async ({ page }) => {
    await page.keyboard.type('1. a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');

    await expect(page.locator('.list-marker').nth(0)).toHaveText('1.');
    await expect(page.locator('.list-marker').nth(1)).toHaveText('2.');
  });

  test('bold can be toggled on and off', async ({ page }) => {
    await page.keyboard.type('toggle me');
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+B`);
    await expect(page.locator('.editable strong')).toHaveText('toggle me');

    await page.keyboard.press(`${modifier}+B`);
    await expect(page.locator('.editable strong')).toHaveCount(0);
    await expect(page.locator(editable).first()).toHaveText('toggle me');
  });

  test('typing over a selection replaces it', async ({ page }) => {
    await page.keyboard.type('hello world');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.type('there');

    await expect(page.locator(editable).first()).toHaveText('hello there');
  });

  test('pasting multi-line text splits it into blocks', async ({ page, context }) => {
    await useSystemClipboard(context);
    await page.evaluate(() => navigator.clipboard.writeText('one\ntwo\nthree'));

    await page.keyboard.press(`${modifier}+V`);

    await expect(page.locator(editable)).toHaveCount(3);
    await expect(page.locator(editable).nth(2)).toHaveText('three');
  });

  test('Backspace in an empty heading turns it back into a paragraph', async ({ page }) => {
    await page.keyboard.type('# ');
    await expect(page.locator('.block-heading')).toHaveCount(1);

    await page.keyboard.press('Backspace');
    await expect(page.locator('.block-heading')).toHaveCount(0);
    await expect(page.locator('.block-paragraph')).toHaveCount(1);
  });

  test('HTML in text is never interpreted', async ({ page }) => {
    await page.keyboard.type('<img src=x onerror=alert(1)><b>x</b>');

    await expect(page.locator('.editable img')).toHaveCount(0);
    await expect(page.locator(editable).first()).toHaveText('<img src=x onerror=alert(1)><b>x</b>');
  });
});
