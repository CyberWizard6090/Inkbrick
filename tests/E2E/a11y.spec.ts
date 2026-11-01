import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

import { useTool } from './sandbox';

async function violations(page: Page) {
  const result = await new AxeBuilder({ page })
    .include('.inkbrick-editor')
    .include('[data-inkbrick-ui]')
    .analyze();

  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

test.describe('Accessibility (axe)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await useTool(page, 'load-sample');
  });

  test('the document with every block type', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
  });

  test('read-only mode', async ({ page }) => {
    await page.getByTestId('mode-read').click();
    expect(await violations(page)).toEqual([]);
  });

  test('toolbar with the color panel, slash menu and block menu', async ({ page }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.locator('[data-testid="toolbar"] [data-format="color"]').click();
    expect(await violations(page)).toEqual([]);

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.getByTestId('slash-menu')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await page.locator('.editable').first().hover();
    await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();
    await expect(page.getByTestId('block-menu')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
