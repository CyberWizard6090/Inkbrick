import { test, expect, type Page } from '@playwright/test';

import { useSetting } from './sandbox';

const root = '[data-inkbrick-root]';
const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function clear(page: Page) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');
}

test.describe('Spell check', () => {
  test('is on in the sandbox, follows the language of the interface and skips code', async ({
    page,
  }) => {
    await page.goto('/?lang=en');

    await expect(page.locator(root)).toHaveAttribute('spellcheck', 'true');
    await expect(page.locator(root)).toHaveAttribute('lang', 'en');

    await clear(page);
    await page.keyboard.type('text');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');

    await expect(page.locator(`${editable}[spellcheck="false"]`)).toHaveCount(1);
    await expect(page.locator(editable).first()).not.toHaveAttribute('spellcheck', /.*/);
  });

  test('the language follows the interface language', async ({ page }) => {
    await page.goto('/?lang=ru');

    await expect(page.locator(root)).toHaveAttribute('lang', 'ru');
  });

  test('?spellcheck=off turns it off and the settings menu switches it', async ({ page }) => {
    await page.goto('/?lang=en&spellcheck=off');

    await expect(page.locator(root)).toHaveAttribute('spellcheck', 'false');
    await expect(page.locator(root)).not.toHaveAttribute('lang', /.*/);

    await useSetting(page, '[data-testid="spellcheck-switch"] button');

    await expect(page.locator(root)).toHaveAttribute('spellcheck', 'true');
  });
});
