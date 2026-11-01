import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const texts = (page: Page) => page.locator(editable).allTextContents();
const snapshot = (page: Page) =>
  page.evaluate(
    () => (window as any).__inkbrick.main.snapshot() as { blocks: Record<string, any> },
  );

test.describe('Quote, code and divider', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('"> " creates a quote; Enter continues it, Enter on an empty line leaves it', async ({
    page,
  }) => {
    await page.keyboard.type('> wise');
    await expect(page.locator('.block-quote')).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('wise');

    await page.keyboard.press('Enter');
    await page.keyboard.type('words');
    await expect(page.locator('.block-quote')).toHaveCount(2);

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // пустая цитата → параграф
    await expect(page.locator('.block-quote')).toHaveCount(2);
    await expect(page.locator('.block-paragraph')).toHaveCount(1);
  });

  test('"``` " creates a code block: Enter adds a line, Enter on an empty line exits', async ({
    page,
  }) => {
    await page.keyboard.type('``` ');
    await expect(page.locator('.block-code')).toHaveCount(1);

    await page.keyboard.type('line 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('line 2');
    await expect(page.locator('.block-code')).toHaveCount(1);
    await expect(page.locator('.block-code .editable')).toHaveText('line 1\nline 2');

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');

    await expect(page.locator('.block-code .editable')).toHaveText('line 1\nline 2');
    await expect(page.locator('.block-paragraph .editable')).toHaveText('after');
  });

  test('Tab in a code block inserts an indent instead of moving focus', async ({ page }) => {
    await page.keyboard.type('``` ');
    await page.keyboard.type('x');
    await page.keyboard.press('Tab');
    await page.keyboard.type('y');

    await expect(page.locator('.block-code .editable')).toHaveText('x  y');
  });

  test('inline formatting shortcuts do not apply inside code', async ({ page }) => {
    await page.keyboard.type('``` ');
    await page.keyboard.type('code');
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+B`);

    await expect(page.locator('.block-code strong')).toHaveCount(0);
  });

  test('the language selector changes the block props through the engine', async ({ page }) => {
    await page.keyboard.type('``` ');
    await page.locator('.code-language').selectOption('python');

    await expect(page.locator('.block-code')).toHaveAttribute('data-language', 'python');

    const blocks = Object.values((await snapshot(page)).blocks);
    expect(blocks.find((b) => b.flavour === 'block:code').props).toEqual({ language: 'python' });

    await page.locator('.block-code .editable').click();
    await page.keyboard.type('print(1)');
    await expect(page.locator('.block-code .editable')).toHaveText('print(1)');
  });

  test('"--- " inserts a divider and moves the caret to a new paragraph', async ({ page }) => {
    await page.keyboard.type('--- ');

    await expect(page.locator('.block-divider hr')).toHaveCount(1);
    await expect(page.locator(editable)).toHaveCount(1); // у разделителя нет текстовой области

    await page.keyboard.type('below');
    await expect(page.locator('.block-paragraph .editable')).toHaveText('below');
  });

  test('Backspace after a divider removes the divider and keeps the text', async ({ page }) => {
    await page.keyboard.type('--- ');
    await page.keyboard.type('below');
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');

    await expect(page.locator('.block-divider')).toHaveCount(0);
    await expect(page.locator('.block-paragraph .editable')).toHaveText('below');

    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.locator('.block-divider')).toHaveCount(1);
  });

  test('a divider is never part of the typed text and selecting across it is safe', async ({
    page,
  }) => {
    await page.keyboard.type('top');
    await page.keyboard.press('Enter');
    await page.keyboard.type('--- ');
    await page.keyboard.type('bottom');

    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press('Backspace');

    await expect(page.locator('.block-divider')).toHaveCount(0);
    expect(await texts(page)).toEqual(['']);
  });

  test('slash menu items create each block type', async ({ page }) => {
    for (const [id, selector] of [
      ['heading-3', '.block-heading.level-3'],
      ['heading-6', '.block-heading.level-6'],
      ['todo-list', '.block-list[data-list-type="todo"]'],
      ['numbered-list', '.block-list[data-list-type="ordered"]'],
      ['quote', '.block-quote'],
      ['code', '.block-code'],
      ['divider', '.block-divider'],
    ] as const) {
      await page.goto('/');
      await page.locator(editable).first().click();
      await page.keyboard.type('/');
      await page.locator(`[data-slash-item="${id}"]`).click();

      await expect(page.locator(selector)).toHaveCount(1);
    }
  });
});
