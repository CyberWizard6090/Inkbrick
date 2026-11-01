import { test, expect, type Page } from '@playwright/test';

import { useTool } from './sandbox';

type Snapshot = {
  rootId: string;
  blocks: Record<string, { flavour: string; props: unknown; content: unknown[] }>;
};

const snapshot = (page: Page, name = 'main') =>
  page.evaluate((n) => (window as any).__inkbrick[n].snapshot() as Snapshot, name);

test.describe('Default UI', () => {
  test('without configuration the built-in components are used', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.block-paragraph')).toHaveCount(1);
    await expect(page.locator('[data-ui]')).toHaveCount(0);
  });
});

test.describe('Unknown blocks', () => {
  test('are shown as a diagnostic fallback and keep their data', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));

    await page.goto('/');
    await useTool(page, 'add-unknown');

    const unknown = page.locator('[data-unknown-flavour="block:mystery"]');
    await expect(unknown).toHaveCount(1);
    await expect(unknown).toContainText('block:mystery');
    await expect(unknown).toHaveAttribute('contenteditable', 'false');
    expect(warnings.some((w) => w.includes('block:mystery'))).toBe(true);

    await page.locator('.editable').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('before!');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');

    const blocks = Object.values((await snapshot(page)).blocks);
    const mystery = blocks.find((b) => b.flavour === 'block:mystery')!;

    expect(mystery.props).toEqual({ secret: 42 });
    expect(mystery.content).toEqual([{ insert: 'secret payload' }]);
    expect(blocks.find((b) => b.flavour === 'block:paragraph')!.content).toEqual([
      { insert: 'before!' },
    ]);
  });

  test('Backspace never merges text into an unknown block', async ({ page }) => {
    await page.goto('/');
    await useTool(page, 'add-unknown');

    await page.locator('.editable').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');

    const blocks = Object.values((await snapshot(page)).blocks);

    expect(blocks.find((b) => b.flavour === 'block:mystery')!.content).toEqual([
      { insert: 'secret payload' },
    ]);
  });
});
