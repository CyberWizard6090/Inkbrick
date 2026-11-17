import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const palette = '[data-testid="command-palette"]';
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

test.describe('Command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['hello world']);
  });

  test('Ctrl+Shift+P opens it with focus in the search, Escape returns to the text', async ({
    page,
  }) => {
    await page.keyboard.press(`${modifier}+Shift+p`);

    await expect(page.locator(palette)).toBeVisible();
    await expect(page.locator(`${palette} input`)).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(page.locator(palette)).toBeHidden();
    await expect(page.locator('[data-inkbrick-root]')).toBeFocused();
  });

  test('formats the selected text with a command', async ({ page }) => {
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    await page.keyboard.press(`${modifier}+Shift+p`);
    await page.keyboard.type('bold');
    await page.keyboard.press('Enter');

    await expect(page.locator(palette)).toBeHidden();
    await expect(page.locator(`${editable} strong, ${editable} b`).first()).toHaveText('hello');
  });

  test('turns the block into a heading and runs an app command', async ({ page }) => {
    await page.keyboard.press(`${modifier}+Shift+p`);
    await page.keyboard.type('turn into: heading 1');
    await page.keyboard.press('Enter');

    await expect(page.locator('.block-heading.level-1')).toHaveText('hello world');

    await page.keyboard.press(`${modifier}+Shift+p`);
    await expect(page.locator(`${palette} input`)).toBeFocused();
    await page.keyboard.type('debug');
    await expect(page.locator(`${palette} [data-inkbrick-part="option"]`)).toHaveCount(1);
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="debug-panel"]')).toBeVisible();
  });
});
