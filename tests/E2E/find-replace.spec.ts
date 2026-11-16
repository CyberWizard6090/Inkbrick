import { test, expect, type Page } from '@playwright/test';

import { useTool } from './sandbox';

const editable = '.editable';
const panel = '[data-testid="find-panel"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

const highlighted = (page: Page, name: string) =>
  page.evaluate((key) => {
    const registry = (CSS as unknown as { highlights?: Map<string, Set<Range>> }).highlights;
    const found = registry?.get(key);

    return found ? [...found].map((range) => range.toString()) : null;
  }, name);

test.describe('Find and replace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['The cat sat', 'on the mat', 'cat and Cat']);
  });

  test('Ctrl+F finds in all blocks, highlights them and walks with Enter', async ({ page }) => {
    await page.keyboard.press(`${modifier}+f`);

    await expect(page.locator(panel)).toBeVisible();
    await expect(page.locator(`${panel} [data-inkbrick-part="query"]`)).toBeFocused();

    await page.keyboard.type('cat');

    await expect(page.locator(`${panel} [data-inkbrick-part="status"]`)).toHaveText('1 / 3');
    expect(await highlighted(page, 'inkbrick-find-current')).toEqual(['cat']);
    expect((await highlighted(page, 'inkbrick-find'))!.length).toBe(2);

    await page.keyboard.press('Enter');
    await expect(page.locator(`${panel} [data-inkbrick-part="status"]`)).toHaveText('2 / 3');

    await page.keyboard.press('Shift+Enter');
    await expect(page.locator(`${panel} [data-inkbrick-part="status"]`)).toHaveText('1 / 3');
  });

  test('match case narrows the result', async ({ page }) => {
    await page.keyboard.press(`${modifier}+f`);
    await page.keyboard.type('cat');
    await page.locator(`${panel} [data-inkbrick-part="case"]`).click();

    await expect(page.locator(`${panel} [data-inkbrick-part="status"]`)).toHaveText('1 / 2');
  });

  test('Ctrl+H replaces one, then all; undo brings it all back at once', async ({ page }) => {
    await page.keyboard.press(`${modifier}+h`);
    await page.keyboard.type('cat');
    await page.locator(`${panel} [data-inkbrick-part="replacement"]`).fill('dog');

    await page.locator(`${panel} [data-inkbrick-part="replace"]`).click();
    await expect(page.locator(editable).first()).toHaveText('The dog sat');

    await page.locator(`${panel} [data-inkbrick-part="replace-all"]`).click();
    await expect(page.locator(editable)).toHaveText(['The dog sat', 'on the mat', 'dog and dog']);
    await expect(page.locator(`${panel} [data-inkbrick-part="status"]`)).toHaveText('No results');

    await page.keyboard.press('Escape');
    await expect(page.locator(panel)).toHaveCount(0);

    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(editable)).toHaveText(['The dog sat', 'on the mat', 'cat and Cat']);
  });

  test('Escape closes the panel, selects the match and clears the highlight', async ({ page }) => {
    await page.keyboard.press(`${modifier}+f`);
    await page.keyboard.type('mat');
    await page.keyboard.press('Escape');

    await expect(page.locator(panel)).toHaveCount(0);
    expect(await page.evaluate(() => getSelection()!.toString())).toBe('mat');
    expect(await highlighted(page, 'inkbrick-find-current')).toBeNull();
  });

  test('in a huge document it opens the block that is not on the page and highlights it', async ({
    page,
  }) => {
    await useTool(page, 'load-large');
    await expect(page.locator('.editable[data-id="large-0"]')).toBeVisible();

    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+f`);
    await page.keyboard.type('Block 30001:');

    await expect(page.locator(`${panel} [data-inkbrick-part="status"]`)).toHaveText('1 / 1');
    await expect(page.locator('.editable[data-id="large-30001"]')).toBeInViewport();
    expect(await highlighted(page, 'inkbrick-find-current')).toEqual(['Block 30001:']);
  });
});
