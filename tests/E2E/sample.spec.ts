import { test, expect } from '@playwright/test';

import { useTool } from './sandbox';

test.describe('Sample document', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await useTool(page, 'load-sample');
  });

  test('contains every block type of the schema', async ({ page }) => {
    const { present, registered } = await page.evaluate(() => {
      const { editor, snapshot } = (window as any).__inkbrick.main;
      const present = new Set(Object.values(snapshot().blocks).map((block: any) => block.flavour));
      const registered = editor.schema
        .getAllBlockSchemas()
        .map((schema: any) => schema.flavour)
        .filter((flavour: string) => flavour !== 'block:page' && flavour !== 'block:note');

      return { present: [...present], registered };
    });

    expect(registered.length).toBeGreaterThanOrEqual(9);

    for (const flavour of registered) expect(present, flavour).toContain(flavour);
  });

  test('contains headings 1-6, all list kinds with nesting and every text style', async ({
    page,
  }) => {
    const info = await page.evaluate(() => {
      const blocks = Object.values((window as any).__inkbrick.main.snapshot().blocks) as any[];
      const attributes = new Set(
        blocks.flatMap((block) =>
          block.content.flatMap((node: any) => Object.keys(node.attributes ?? {})),
        ),
      );

      return {
        levels: blocks
          .filter((b) => b.flavour === 'block:heading')
          .map((b) => b.props.level)
          .sort(),
        lists: [
          ...new Set(blocks.filter((b) => b.flavour === 'block:list').map((b) => b.props.type)),
        ].sort(),
        nested: blocks.some(
          (b) =>
            b.flavour === 'block:list' &&
            blocks.find((p) => p.id === b.parentId)?.flavour === 'block:list',
        ),
        attributes: [...attributes].sort(),
      };
    });

    expect(info.levels).toEqual([1, 2, 3, 4, 5, 6]);
    expect(info.lists).toEqual(['bullet', 'ordered', 'todo']);
    expect(info.nested).toBe(true);
    expect(info.attributes).toEqual(
      expect.arrayContaining([
        'bold',
        'italic',
        'underline',
        'strike',
        'code',
        'link',
        'color',
        'backgroundColor',
        'formula',
      ]),
    );
  });

  test('renders: image, block formula, callouts and the centered paragraph are on the page', async ({
    page,
  }) => {
    await expect(page.locator('.image-figure img')).toBeVisible();
    await expect(page.locator('[data-inkbrick-part="formula-display"] math')).toBeVisible();
    await expect(page.locator('[data-inkbrick-block="callout"]')).toHaveCount(2);
    await expect(page.locator('.block-divider')).toHaveCount(1);
    await expect(page.locator('[data-align="center"]').first()).toBeVisible();
  });

  test('a second click adds the sample after the existing content instead of replacing it', async ({
    page,
  }) => {
    const before = await page.locator('.editable').count();

    await useTool(page, 'load-sample');

    expect(await page.locator('.editable').count()).toBeGreaterThan(before);
    await expect(page.locator('.editable').first()).toHaveText('First paragraph');
  });
});
