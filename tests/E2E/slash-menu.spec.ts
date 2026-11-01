import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const menu = '[data-testid="slash-menu"]';

const texts = (page: Page) => page.locator(editable).allTextContents();

test.describe('Slash menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('opens on "/" in an empty block and lists the block types', async ({ page }) => {
    await page.keyboard.type('/');

    await expect(page.locator(menu)).toBeVisible();
    await expect(page.locator('[role="option"]')).toHaveCount(17);
    await expect(page.locator('[role="option"]').first()).toHaveAttribute('aria-selected', 'true');
  });

  test('filters while typing and Enter converts the block (the "/query" text disappears)', async ({
    page,
  }) => {
    await page.keyboard.type('/head');

    await expect(page.locator('[role="option"]')).toHaveCount(6);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter'); // Heading 2

    await expect(page.locator(menu)).toHaveCount(0);
    await expect(page.locator('.block-heading.level-2')).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('');

    await page.keyboard.type('Title');
    await expect(page.locator(editable).first()).toHaveText('Title');
  });

  test('Arrow keys wrap around and Tab selects', async ({ page }) => {
    await page.keyboard.type('/');
    await page.keyboard.press('ArrowUp'); // с первого пункта — на последний (Counter из песочницы)
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveAttribute(
      'data-slash-item',
      'counter',
    );

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveAttribute(
      'data-slash-item',
      'text',
    );

    await page.keyboard.type('quo');
    await page.keyboard.press('Tab');

    await expect(page.locator('.block-quote')).toHaveCount(1);
  });

  test('clicking an item converts the block and keeps focus in the editor', async ({ page }) => {
    await page.keyboard.type('/');
    await page.locator('[data-slash-item="bullet-list"]').click();

    await expect(page.locator('.block-list[data-list-type="bullet"]')).toHaveCount(1);

    await page.keyboard.type('item');
    await expect(page.locator(editable).first()).toHaveText('item');
  });

  test('Escape closes the menu and leaves the typed text', async ({ page }) => {
    await page.keyboard.type('/he');
    await page.keyboard.press('Escape');

    await expect(page.locator(menu)).toHaveCount(0);
    await expect(page.locator(editable).first()).toHaveText('/he');
  });

  test('does not open in the middle of a word, but opens after a space', async ({ page }) => {
    await page.keyboard.type('a/');
    await expect(page.locator(menu)).toHaveCount(0);

    await page.keyboard.type(' /');
    await expect(page.locator(menu)).toBeVisible();
  });

  test('works in a non-empty paragraph: only the "/query" is replaced', async ({ page }) => {
    await page.keyboard.type('Hello /quo');
    await page.keyboard.press('Enter');

    await expect(page.locator('.block-quote')).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('Hello ');
  });

  test('closes when the slash is deleted or the caret moves before it', async ({ page }) => {
    await page.keyboard.type('x /');
    await expect(page.locator(menu)).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(page.locator(menu)).toHaveCount(0);

    await page.keyboard.type('/');
    await expect(page.locator(menu)).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(menu)).toHaveCount(0);
  });

  test('shows "No results" and closes on a space; Enter then behaves as a normal Enter', async ({
    page,
  }) => {
    await page.keyboard.type('/zzz');
    await expect(page.locator(menu)).toContainText('No results');

    await page.keyboard.press('Enter'); // нечего выбирать — обычный Enter
    await expect(page.locator(menu)).toHaveCount(0);
    expect(await texts(page)).toEqual(['/zzz', '']);
  });

  test('typing a space after an unmatched query closes the menu', async ({ page }) => {
    await page.keyboard.type('/zzz ');

    await expect(page.locator(menu)).toHaveCount(0);
    await expect(page.locator(editable).first()).toHaveText('/zzz ');
  });

  test('conversion is one undo step and restores "/query"', async ({ page }) => {
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');
    await expect(page.locator('.block-code')).toHaveCount(1);

    await page.keyboard.press(`${modifier}+Z`);

    await expect(page.locator('.block-code')).toHaveCount(0);
    await expect(page.locator(editable).first()).toHaveText('/code');
  });

  test('the menu is not offered inside a code block', async ({ page }) => {
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');

    await expect(page.locator(menu)).toHaveCount(0);
    await expect(page.locator(editable).first()).toHaveText('/');
  });
});
