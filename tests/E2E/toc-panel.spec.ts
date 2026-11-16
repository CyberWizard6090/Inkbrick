import { test, expect, type Page } from '@playwright/test';

import { useTool } from './sandbox';

const panel = '[data-testid="toc-panel"]';

test.describe('Table of contents panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
  });

  const open = async (page: Page, query = '') => {
    await page.goto(`/?lang=en${query}`);
    await useTool(page, 'load-sample');
  };

  test('shows the headings at the right edge and a click goes to the heading', async ({ page }) => {
    await open(page);

    await expect(page.locator(panel)).toBeVisible();
    await expect(page.locator(panel)).toHaveAttribute('data-side', 'right');

    const box = (await page.locator(panel).boundingBox())!;

    expect(box.x + box.width).toBeGreaterThan(1400 - 40);

    const links = page.locator(`${panel} [data-inkbrick-part="link"]`);
    const count = await links.count();

    expect(count).toBeGreaterThan(2);

    const last = links.nth(count - 1);
    const text = (await last.textContent())!;

    await last.click();
    await expect(page.locator('.editable', { hasText: text }).first()).toBeInViewport();
  });

  test('the side can be set and the panel can be left out', async ({ page }) => {
    await open(page, '&toc=left');
    await expect(page.locator(panel)).toHaveAttribute('data-side', 'left');

    await open(page, '&toc=off');
    await expect(page.locator(panel)).toHaveCount(0);
  });

  test('is hidden when the window is narrow', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 900, height: 800 });

    await expect(page.locator(panel)).toBeHidden();
  });
});
