import { test, expect } from '@playwright/test';

import { useTool } from './sandbox';

/**
 * Порядок слоёв: каждый всплывающий элемент лежит над тем, что под ним должно быть. Элементы создаются с теми же
 * атрибутами, что у настоящих, а z-index читается из стилей (`--inkbrick-z-*`).
 */
test.describe('Layers', () => {
  test('editor layers go in a fixed order, from the side panel up to tooltips', async ({
    page,
  }) => {
    await page.goto('/?lang=en');

    const z = await page.evaluate(() => {
      const root = document.querySelector('[data-inkbrick-root]')!;
      const layers: Array<[string, string]> = [
        ['panel', 'toc-panel'],
        ['handle', 'block-handle'],
        ['tableControls', 'table-controls'],
        ['menu', 'block-menu'],
        ['contextMenu', 'context-menu'],
        ['drop', 'drop-indicator'],
        ['toolbar', 'toolbar'],
        ['slash', 'slash-menu'],
        ['select', 'select'],
        ['find', 'find'],
        ['cropper', 'image-cropper'],
        ['viewer', 'image-viewer'],
        ['tooltip', 'tooltip'],
      ];
      const result: Record<string, number> = {};

      for (const [name, ui] of layers) {
        const element = document.createElement('div');

        element.setAttribute('data-inkbrick-ui', ui);
        (root.parentElement ?? document.body).append(element);
        result[name] = Number(getComputedStyle(element).zIndex);
        element.remove();
      }

      return result;
    });

    for (const value of Object.values(z)) expect(Number.isFinite(value)).toBe(true);

    expect(z.panel).toBeLessThan(z.handle);
    expect(z.handle).toBeLessThanOrEqual(z.tableControls);
    expect(z.tableControls).toBeLessThan(z.menu);
    expect(z.menu).toBe(z.contextMenu);
    expect(z.menu).toBeLessThan(z.drop);
    expect(z.drop).toBeLessThan(z.toolbar);
    expect(z.toolbar).toBeLessThan(z.slash);
    expect(z.slash).toBe(z.select);
    expect(z.select).toBe(z.find);
    expect(z.find).toBeLessThan(z.cropper);
    expect(z.cropper).toBe(z.viewer);
    expect(z.viewer).toBeLessThan(z.tooltip);
  });

  test('the debug panel of the sandbox covers the outline panel', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto('/?lang=en');
    await useTool(page, 'load-sample');

    const outline = page.locator('[data-inkbrick-ui="toc-panel"]');

    await expect(outline).toBeVisible();
    await useTool(page, 'toggle-debug');

    const debug = page.locator('.debug-panel');

    await expect(debug).toBeVisible();

    const a = (await outline.boundingBox())!;
    const b = (await debug.boundingBox())!;
    // Точка, где панели перекрываются.
    const x = Math.max(a.x, b.x) + 4;
    const y = Math.max(a.y, b.y) + 8;

    expect(x).toBeLessThan(Math.min(a.x + a.width, b.x + b.width));

    const top = await page.evaluate(
      ([px, py]) => !!document.elementFromPoint(px, py)?.closest('.debug-panel'),
      [x, y] as const,
    );

    expect(top).toBe(true);
  });

  test('an open image tools menu lies over the blocks below the picture', async ({ page }) => {
    await page.goto('/?lang=en');
    await useTool(page, 'load-sample');

    const figure = page.locator('[data-inkbrick-part="figure"]').first();

    await figure.scrollIntoViewIfNeeded();
    await figure.hover();
    await page.locator('[data-tool="more"]').click();

    const popover = page.locator('[data-popover="more"]');

    await expect(popover).toBeVisible();

    const box = (await popover.boundingBox())!;
    const hits = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-popover="more"]'),
      [box.x + box.width / 2, box.y + box.height - 6] as const,
    );

    expect(hits).toBe(true);
  });
});
