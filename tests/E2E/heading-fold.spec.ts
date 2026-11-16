import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function outline(page: Page, persist = false) {
  await page.goto(persist ? '/?lang=en&persist=1' : '/?lang=en');
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+End`);
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Fold me');
  await page.keyboard.press('Enter');
  await page.keyboard.type('first inside');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second inside');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Stay visible');
}

const heading = (page: Page, text: string) =>
  page.locator('[data-inkbrick-block="heading"]', { hasText: text });

test.describe('Heading folding', () => {
  test('the arrow hides the section up to the next heading and shows it again', async ({
    page,
  }) => {
    await outline(page);

    await heading(page, 'Fold me').hover();
    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();

    await expect(page.locator(editable, { hasText: 'first inside' })).toHaveCount(0);
    await expect(page.locator(editable, { hasText: 'second inside' })).toHaveCount(0);
    await expect(heading(page, 'Stay visible')).toBeVisible();
    await expect(heading(page, 'Fold me')).toHaveAttribute('data-collapsed', 'true');

    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();
    await expect(page.locator(editable, { hasText: 'first inside' })).toHaveCount(1);
  });

  test('undo brings the section back', async ({ page }) => {
    await outline(page);

    await heading(page, 'Fold me').hover();
    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();
    await expect(page.locator(editable, { hasText: 'first inside' })).toHaveCount(0);

    await heading(page, 'Stay visible').locator(editable).click();
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(editable, { hasText: 'first inside' })).toHaveCount(1);
  });

  test('the collapsed state survives a reload and the arrow opens it again', async ({ page }) => {
    await outline(page, true);

    await heading(page, 'Fold me').hover();
    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();

    await expect
      .poll(() => page.evaluate(() => Object.keys(localStorage).length), { timeout: 10_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(700);
    await page.reload();

    await expect(heading(page, 'Fold me')).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator(editable, { hasText: 'first inside' })).toHaveCount(0);

    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();
    await expect(page.locator(editable, { hasText: 'first inside' })).toHaveCount(1);
  });

  test('Enter at the end of a collapsed heading opens it and adds a line below', async ({
    page,
  }) => {
    await outline(page);

    await heading(page, 'Fold me').hover();
    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();

    await heading(page, 'Fold me').locator(editable).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('new line');

    await expect(page.locator(editable, { hasText: 'first inside' })).toHaveCount(1);
    await expect(page.locator(editable, { hasText: 'new line' })).toHaveCount(1);
  });
});
