import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const label = '[data-testid="counter"] .editable';
const counter = '[data-testid="counter"]';
const value = '[data-testid="counter-value"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const events = (page: Page) => page.evaluate(() => window.__counterEvents!());
const kinds = async (page: Page) => (await events(page)).map((event) => event.split(':')[0]);

async function insertCounter(page: Page) {
  await page.locator(editable).first().click();
  await page.keyboard.type('/count');
  await expect(page.locator('[role="option"][data-slash-item="counter"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator(counter)).toHaveCount(1);
}

test.describe('Custom block with a controller (sandbox counter)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('is inserted from the slash menu and runs lifecycle hooks', async ({ page }) => {
    await insertCounter(page);

    await expect(page.locator(value)).toHaveText('0');
    expect(await kinds(page)).toEqual(expect.arrayContaining(['create', 'insert']));
  });

  test('buttons run controller commands; undo restores props', async ({ page }) => {
    await insertCounter(page);

    await page.getByTestId('counter-inc').click();
    await page.getByTestId('counter-inc').click();
    await expect(page.locator(value)).toHaveText('2');
    expect(await kinds(page)).toContain('count=2');

    await page.getByTestId('counter-dec').click();
    await expect(page.locator(value)).toHaveText('1');

    await page.evaluate(() => window.__inkbrick!.main.editor.undo());
    await expect(page.locator(value)).toHaveText('2');
  });

  test('block menu shows the controller item', async ({ page }) => {
    await insertCounter(page);
    await page.getByTestId('counter-inc').click();
    await expect(page.locator(value)).toHaveText('1');

    await page.locator(value).hover();
    await expect(page.locator('[data-testid="block-handle"]')).toBeVisible();
    await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();

    const reset = page.locator('[data-testid="block-menu"] [data-action="counter.reset"]');
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(page.locator(value)).toHaveText('0');
  });

  test('focus hooks and key bindings work when the caret is on the counter', async ({ page }) => {
    await insertCounter(page);

    await expect(page.locator(counter)).toHaveAttribute('data-focused', 'true');
    expect(await kinds(page)).toContain('focus');

    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(page.locator(value)).toHaveText('2');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator(value)).toHaveText('1');

    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(value)).toHaveText('2');

    // Enter в подписи создаёт параграф ниже: каретка уходит — onBlur; клик по подписи возвращает — onFocus.
    await page.keyboard.press('Enter');
    await expect(page.locator(counter)).not.toHaveAttribute('data-focused');
    expect(await kinds(page)).toContain('blur');

    await page.locator(label).click();
    await expect(page.locator(counter)).toHaveAttribute('data-focused', 'true');
  });

  test('read-only mode disables the buttons and rejects commands', async ({ page }) => {
    await insertCounter(page);
    await page.getByTestId('counter-inc').click();
    await expect(page.locator(value)).toHaveText('1');

    await page.locator('[data-testid="mode-read"]').click();

    await expect(page.getByTestId('counter-inc')).toBeDisabled();
    await expect(page.getByTestId('counter-dec')).toBeDisabled();

    const result = await page.evaluate(() => {
      const { editor } = window.__inkbrick!.main;
      const id = document.querySelector('[data-testid="counter"]')!.getAttribute('data-block-id')!;

      return editor.execute('counter.increment', { blockId: id }) ?? null;
    });
    expect(result).toBeNull();
    await expect(page.locator(value)).toHaveText('1');
  });
});
