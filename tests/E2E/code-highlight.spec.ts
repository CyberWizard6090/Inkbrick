import { test, expect, type Page } from '@playwright/test';

import { useTool, useSystemClipboard } from './sandbox';

const code = '[data-inkbrick-block="code"]';
const content = `${code} [data-inkbrick-part="content"]`;

const tokens = (page: Page) =>
  page
    .locator(`${content} [data-inkbrick-token]`)
    .evaluateAll((nodes) =>
      nodes.map((node) => [node.textContent, node.getAttribute('data-inkbrick-token')]),
    );

async function startCode(page: Page, language: string) {
  await page.goto('/?lang=en');
  await page.locator('.editable').first().click();
  await page.keyboard.type('``` ');
  await expect(page.locator(code)).toHaveCount(1);
  await page.locator(`${code} select`).selectOption(language);
  await page.locator(content).click();
}

test.describe('Code block: syntax highlighting', () => {
  test('highlights while typing and keeps the caret in the right place', async ({ page }) => {
    await startCode(page, 'typescript');
    await page.keyboard.type('const n = 42; // ok');

    await expect(page.locator(content)).toHaveText('const n = 42; // ok');
    expect(await tokens(page)).toEqual(
      expect.arrayContaining([
        ['const', 'keyword'],
        ['42', 'number'],
        ['// ok', 'comment'],
      ]),
    );

    await page.keyboard.type('!');
    await expect(page.locator(content)).toHaveText('const n = 42; // ok!');
  });

  test('editing in the middle of a token works (caret does not jump)', async ({ page }) => {
    await startCode(page, 'typescript');
    await page.keyboard.type('const x = 1');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('Z');

    await expect(page.locator(content)).toHaveText('coZnst x = 1');
    expect((await tokens(page)).map(([text]) => text)).not.toContain('coZnst');
  });

  test('Enter inserts a new line and the next line is highlighted too', async ({ page }) => {
    await startCode(page, 'python');
    await page.keyboard.type('def f():');
    await page.keyboard.press('Enter');
    await page.keyboard.type('return None');

    await expect(page.locator(content)).toHaveText('def f():\nreturn None');
    expect(await tokens(page)).toEqual(
      expect.arrayContaining([
        ['def', 'keyword'],
        ['f', 'function'],
        ['return', 'keyword'],
        ['None', 'constant'],
      ]),
    );
  });

  test('changing the language re-highlights without touching the text', async ({ page }) => {
    await startCode(page, 'plain');
    await page.keyboard.type('SELECT 1');

    expect(await tokens(page)).toEqual([]);

    await page.locator(`${code} select`).selectOption('sql');
    await expect(page.locator(content)).toHaveText('SELECT 1');
    expect(await tokens(page)).toEqual([
      ['SELECT', 'keyword'],
      ['1', 'number'],
    ]);
  });

  test('token colors come from the theme and follow the light/dark switch', async ({ page }) => {
    await startCode(page, 'typescript');
    await page.keyboard.type('const a = 1');

    const keyword = page.locator(`${content} [data-inkbrick-token="keyword"]`);

    await page.evaluate(() =>
      document.documentElement.setAttribute('data-inkbrick-theme', 'light'),
    );
    await expect(keyword).toHaveCSS('color', 'rgb(0, 0, 255)');

    await page.evaluate(() => document.documentElement.setAttribute('data-inkbrick-theme', 'dark'));
    await expect(keyword).toHaveCSS('color', 'rgb(86, 156, 214)');
  });

  test('a user rule overrides a token color without !important', async ({ page }) => {
    await startCode(page, 'typescript');
    await page.keyboard.type('const a = 1');
    await page.addStyleTag({ content: '[data-inkbrick-token="keyword"] { color: rgb(1, 2, 3); }' });

    await expect(page.locator(`${content} [data-inkbrick-token="keyword"]`)).toHaveCSS(
      'color',
      'rgb(1, 2, 3)',
    );
  });

  test('the copy button copies the code', async ({ page, context }) => {
    await useSystemClipboard(context);
    await startCode(page, 'typescript');
    await page.keyboard.type('let z = 3');
    await page.locator(`${code} [data-inkbrick-part="copy"]`).click();

    await expect(page.locator(`${code} [data-inkbrick-part="copy"]`)).toHaveAttribute(
      'data-state',
      'copied',
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('let z = 3');
  });

  test('undo restores the previous text and highlighting', async ({ page }) => {
    await startCode(page, 'typescript');
    await page.keyboard.type('let a');
    await page.keyboard.press('Control+Z');

    await expect(page.locator(content)).toHaveText('');
    expect(await tokens(page)).toEqual([]);
  });

  test('is not applied in read-only mode only to non-code blocks, code stays highlighted', async ({
    page,
  }) => {
    await page.goto('/');
    await useTool(page, 'load-sample');
    await page.getByTestId('mode-read').click();

    await expect(page.locator(code)).toHaveAttribute('data-language', 'python');
    expect(await tokens(page)).toEqual(expect.arrayContaining([['print', 'builtin']]));
  });
});
