import { test, expect } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Page layout', () => {
  test('the editor fills its container and the page width comes from a CSS variable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto('/?lang=en');
    await page.locator(editable).first().click();

    const root = page.locator('[data-inkbrick-root]');
    const before = (await root.boundingBox())!;
    const wide = (await page.locator(editable).first().boundingBox())!;

    await page.evaluate(() =>
      document.documentElement.style.setProperty('--inkbrick-page-width', '400px'),
    );

    const after = (await root.boundingBox())!;
    const narrow = (await page.locator(editable).first().boundingBox())!;

    // Поле редактора осталось прежним, а текст сузился до страницы и встал по центру.
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(narrow.width - 400)).toBeLessThanOrEqual(2);
    expect(narrow.width).toBeLessThan(wide.width);
    expect(Math.abs(narrow.x + narrow.width / 2 - (after.x + after.width / 2))).toBeLessThanOrEqual(
      2,
    );
  });
});

test.describe('Heading folding arrow', () => {
  test('does not shift the heading: its text starts where a paragraph starts', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press('Delete');
    await page.keyboard.type('# Title');
    await page.keyboard.press('Enter');
    await page.keyboard.type('plain');

    const heading = (await page.locator('.editable').nth(0).boundingBox())!;
    const paragraph = (await page.locator('.editable').nth(1).boundingBox())!;

    await expect(
      page.locator('[data-inkbrick-block="heading"] [data-inkbrick-part="fold"]'),
    ).toHaveCount(1);
    expect(Math.abs(heading.x - paragraph.x)).toBeLessThanOrEqual(1);
  });
});

test.describe('Sandbox navigation', () => {
  test('switches between the editor and the table editor and back', async ({ page }) => {
    await page.goto('/?lang=en');
    await expect(page.getByTestId('demo-editor')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('demo-table').click();
    await expect(page).toHaveURL(/demo=table/);
    await expect(page.getByTestId('demo-table')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-inkbrick-block="table"]')).toBeVisible();

    await page.getByTestId('demo-editor').click();
    await expect(page).not.toHaveURL(/demo=table/);
    await expect(page.locator(editable).first()).toBeVisible();
  });
});
