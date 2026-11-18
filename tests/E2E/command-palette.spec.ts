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

const animationOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);

    return { name: style.animationName, duration: style.animationDuration };
  });

test.describe('Command palette appearance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['hello world']);
  });

  test('the query line keeps its height when the list is long', async ({ page }) => {
    await page.keyboard.press(`${modifier}+Shift+p`);
    await expect(page.locator(palette)).toBeVisible();

    const query = page.locator(`${palette} [data-inkbrick-part="query"]`);

    await expect.poll(async () => (await query.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  test('the dimming fades in and the window drops in', async ({ page }) => {
    await page.keyboard.press(`${modifier}+Shift+p`);
    await expect(page.locator(palette)).toBeVisible();

    expect(await animationOf(page, '[data-inkbrick-ui="palette-backdrop"]')).toEqual({
      name: 'inkbrick-fade-in',
      duration: '0.1s',
    });
    expect(await animationOf(page, palette)).toEqual({
      name: 'inkbrick-slide-down',
      duration: '0.1s',
    });

    // После анимации окно стоит на своём месте.
    await page.waitForTimeout(250);
    expect(await page.locator(palette).evaluate((el) => getComputedStyle(el).transform)).toBe(
      'none',
    );
  });

  test('is off with prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.keyboard.press(`${modifier}+Shift+p`);
    await expect(page.locator(palette)).toBeVisible();

    expect((await animationOf(page, palette)).name).toBe('none');
    expect((await animationOf(page, '[data-inkbrick-ui="palette-backdrop"]')).name).toBe('none');
  });
});

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
