import { test, expect } from '@playwright/test';

test.describe('Styling contract (data attributes)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const { editor } = (window as any).__inkbrick.main;
      const note = editor.document.getBlock(editor.document.rootId).children[0];
      let after = editor.document.getBlock(note).children[0];
      const add = (flavour: string, props?: Record<string, unknown>) => {
        after = editor.dispatch({
          type: 'insertBlock',
          payload: { flavour, afterId: after, props },
        }).blockId;
      };

      add('block:heading', { level: 2 });
      add('block:list', { type: 'todo', checked: true });
      add('block:callout', { tone: 'warning' });
      add('block:code', { language: 'ts' });
      add('block:quote');
      add('block:divider');
    });
  });

  test('every block has data-inkbrick-block and a content part', async ({ page }) => {
    for (const name of ['paragraph', 'heading', 'list', 'callout', 'code', 'quote', 'divider']) {
      await expect(page.locator(`[data-inkbrick-block="${name}"]`).first()).toBeVisible();
    }

    await expect(
      page.locator('[data-inkbrick-block="heading"] [data-inkbrick-part="content"]'),
    ).toHaveCount(1);
  });

  test('parameters are exposed as attributes', async ({ page }) => {
    await expect(page.locator('[data-inkbrick-block="heading"]')).toHaveAttribute(
      'data-level',
      '2',
    );
    await expect(page.locator('[data-inkbrick-block="list"]')).toHaveAttribute(
      'data-list-type',
      'todo',
    );
    await expect(page.locator('[data-inkbrick-block="list"]')).toHaveAttribute(
      'data-checked',
      'true',
    );
    await expect(page.locator('[data-inkbrick-block="callout"]')).toHaveAttribute(
      'data-tone',
      'warning',
    );
    await expect(page.locator('[data-inkbrick-block="code"]')).toHaveAttribute(
      'data-language',
      'ts',
    );
    await expect(page.locator('[data-inkbrick-root]')).toHaveCount(1);
  });

  test('heading level drives the default font size through attributes only', async ({ page }) => {
    const size = await page
      .locator('[data-inkbrick-block="heading"] [data-inkbrick-part="content"]')
      .evaluate((element) => getComputedStyle(element).fontSize);

    expect(size).toBe('28px');
  });

  test('a plain unlayered rule with the lowest specificity beats the defaults', async ({
    page,
  }) => {
    await page.addStyleTag({
      content: '[data-inkbrick-block="heading"][data-level="2"] { font-size: 11px; }',
    });

    const size = await page
      .locator('[data-inkbrick-block="heading"]')
      .evaluate((element) => getComputedStyle(element).fontSize);

    expect(size).toBe('11px');
  });

  test('tokens can be overridden from the outside', async ({ page }) => {
    await page.addStyleTag({ content: ':root { --inkbrick-brand-bg: rgb(1, 2, 3); }' });

    // У чекбокса плавный переход цвета: ждём итоговое значение, а не кадр посреди анимации.
    await expect(
      page.locator('[data-inkbrick-block="list"] [data-inkbrick-part="checkbox"]'),
    ).toHaveCSS('background-color', 'rgb(1, 2, 3)');
  });

  test('the theme switches by attribute', async ({ page }) => {
    const read = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--inkbrick-bg-1').trim(),
      );

    await page.evaluate(() =>
      document.documentElement.setAttribute('data-inkbrick-theme', 'light'),
    );
    expect(await read()).toBe('#ffffff');

    await page.evaluate(() => document.documentElement.setAttribute('data-inkbrick-theme', 'dark'));
    expect(await read()).toBe('#292929');
  });

  test('overlays expose data-inkbrick-ui and parts', async ({ page }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.type('/');

    const menu = page.locator('[data-inkbrick-ui="slash-menu"]');

    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-inkbrick-part="item"][data-active]')).toHaveCount(1);
    await expect(
      menu.locator('[data-inkbrick-part="item"] [data-inkbrick-icon]').first(),
    ).toBeVisible();
  });
});
