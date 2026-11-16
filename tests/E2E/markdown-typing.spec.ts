import { test, expect } from '@playwright/test';

const editable = '.editable';

test.describe('Markdown while typing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator(editable).first().click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
  });

  test('inline markup becomes formatting and the text after it stays plain', async ({ page }) => {
    await page.keyboard.type('a **bold** b *it* c ~~gone~~ d `code` e');

    const line = page.locator(editable).last();

    await expect(line).toHaveText('a bold b it c gone d code e');
    await expect(line.locator('strong, b')).toHaveText('bold');
    await expect(line.locator('em, i')).toHaveText('it');
    await expect(line.locator('s, del, strike')).toHaveText('gone');
    await expect(line.locator('code')).toHaveText('code');
  });

  test('a link in square brackets and undo', async ({ page }) => {
    await page.keyboard.type('see [docs](https://example.com)');

    await expect(page.locator(`${editable} a[href="https://example.com"]`).last()).toHaveText(
      'docs',
    );

    await page.keyboard.press('Control+z');
    await expect(page.locator(editable).last()).toHaveText('see [docs](https://example.com');
  });

  test('block forms: [x] and 1)', async ({ page }) => {
    await page.keyboard.type('[x] done');
    await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(1);

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1) first');
    await expect(page.locator(editable).last()).toHaveText('first');
    await expect(
      page.locator('.block-list[data-list-type="ordered"]', { hasText: 'first' }),
    ).toHaveCount(1);
  });
});
