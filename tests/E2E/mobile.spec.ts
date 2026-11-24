import { test, expect, type Page } from '@playwright/test';

import { requireCdp, useTool } from './sandbox';

test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });

// Эмуляцию мобильного устройства (isMobile) Firefox в Playwright не поддерживает.
test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');

const toolbar = '[data-testid="toolbar"]';

const box = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  });

test.describe('Mobile layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?formatting=toolbar&lang=en');
  });

  test('the page has no horizontal scroll and the editor uses the width', async ({ page }) => {
    await useTool(page, 'load-sample');

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    expect((await box(page, '.inkbrick-editor')).width).toBeGreaterThan(280);
  });

  test('the toolbar and its color panel stay inside the screen', async ({ page }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.type('some text near the edge');
    await page.keyboard.press('Shift+Home');
    await expect(page.locator(toolbar)).toBeVisible();

    const bar = await box(page, toolbar);
    expect(bar.left).toBeGreaterThanOrEqual(0);
    expect(bar.right).toBeLessThanOrEqual(375);

    await page.locator(`${toolbar} [data-format="color"]`).click();
    const panel = await box(page, `${toolbar} [data-inkbrick-part="panel"]`);
    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(375);
  });

  test('on a phone the toolbar is docked at the bottom, full width; its panel opens above it', async ({
    page,
  }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.type('some text to format');
    await page.keyboard.press('Shift+Home');

    const bar = page.locator(toolbar);

    await expect(bar).toHaveAttribute('data-placement', 'docked');
    await page.waitForTimeout(350);

    const rect = (await bar.boundingBox())!;

    expect(rect.x).toBe(0);
    expect(Math.round(rect.width)).toBe(375);
    expect(Math.round(rect.y + rect.height)).toBe(740);

    // Палитра цвета — над полосой, а не под ней (под ней экранная клавиатура).
    await bar.locator('[aria-expanded]').nth(1).click();
    const panel = (await bar.locator('> [data-inkbrick-part="panel"]').boundingBox())!;

    expect(panel.y + panel.height).toBeLessThanOrEqual(rect.y);
  });

  test('the slash menu fits the screen', async ({ page }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.type('/');

    const menu = await box(page, '[data-testid="slash-menu"]');
    expect(menu.left).toBeGreaterThanOrEqual(0);
    expect(menu.right).toBeLessThanOrEqual(375);
  });
});

test.describe('Mobile keyboard input (IME composition)', () => {
  const text = (page: Page) =>
    page.evaluate(() => {
      const snapshot = (window as any).__inkbrick.main.snapshot();
      return Object.values(snapshot.blocks)
        .filter((block: any) => block.flavour === 'block:paragraph')
        .map((block: any) => block.content.map((node: any) => node.insert).join(''));
    });

  test.beforeEach(({ page }) => requireCdp(page));

  const compose = async (page: Page, word: string, replace?: { start: number; end: number }) => {
    const cdp = await page.context().newCDPSession(page);

    for (let i = 1; i <= word.length; i++) {
      const part = word.slice(0, i);
      await cdp.send('Input.imeSetComposition', {
        text: part,
        selectionStart: part.length,
        selectionEnd: part.length,
        ...(replace && i === 1
          ? { replacementStart: replace.start, replacementEnd: replace.end }
          : {}),
      });
    }
    await cdp.send('Input.insertText', { text: word });
    await cdp.detach();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/?formatting=toolbar&lang=en');
    await page.locator('.editable').first().tap();
  });

  test('composed words reach the model and are not wiped by the next input', async ({ page }) => {
    await compose(page, 'hello');
    await page.keyboard.insertText(' ');
    await compose(page, 'world');

    await expect(page.locator('.editable').first()).toHaveText('hello world');
    expect(await text(page)).toEqual(['hello world']);
  });

  test('recomposing an existing word (keyboard backspace/autocorrect) edits it in place', async ({
    page,
  }) => {
    await compose(page, 'hello');
    await page.keyboard.insertText(' ');
    await compose(page, 'wrld');
    await compose(page, 'world', { start: 6, end: 10 });

    await expect(page.locator('.editable').first()).toHaveText('hello world');
    expect(await text(page)).toEqual(['hello world']);
  });

  test('Enter after a composed word splits the block; typing continues in the new one', async ({
    page,
  }) => {
    await compose(page, 'first');
    await page.keyboard.press('Enter');
    await compose(page, 'second');

    expect(await text(page)).toEqual(['first', 'second']);
  });
});

test('the empty-block hint hides while a word is being composed', async ({ page }) => {
  await page.goto('/?formatting=toolbar&lang=en');
  await page.locator('.editable').first().tap();

  const hint = () =>
    page
      .locator('.editable')
      .first()
      .evaluate((el) => getComputedStyle(el, '::before').content);

  expect(await hint()).toContain('Press');

  requireCdp(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'he', selectionStart: 2, selectionEnd: 2 });

  await expect(page.locator('.editable').first()).toHaveAttribute('data-composing', '');
  expect(await hint()).toBe('none');

  await cdp.send('Input.insertText', { text: 'he' });
  await expect(page.locator('.editable').first()).not.toHaveAttribute('data-composing');
  expect(await hint()).toBe('none');
  await expect(page.locator('.editable').first()).toHaveText('he');
});

test('the tools menu opens inside the screen', async ({ page }) => {
  await page.goto('/?formatting=toolbar&lang=en');
  await page.getByTestId('tools-menu').click();

  const menu = await page.getByRole('menu').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });

  expect(menu.left).toBeGreaterThanOrEqual(0);
  expect(menu.right).toBeLessThanOrEqual(375);
});

test.describe('Phone: floating windows are bottom sheets', () => {
  const sheet = async (page: Page, selector: string) => {
    const element = page.locator(selector);

    await expect(element).toHaveAttribute('data-sheet', 'true');

    // Лист выезжает снизу: мерить, когда анимация кончилась.
    return element.evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        width: innerWidth,
        height: innerHeight,
      };
    });
  };
  const atBottom = (box: {
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }) => {
    expect(box.left).toBeLessThanOrEqual(1);
    expect(box.right).toBeGreaterThanOrEqual(box.width - 1);
    expect(Math.abs(box.bottom - box.height)).toBeLessThanOrEqual(1);
  };

  test('the slash menu is a sheet; picking an item still converts the block', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator('.editable').first().tap();
    await page.keyboard.type('/');
    atBottom(await sheet(page, '[data-testid="slash-menu"]'));

    await page.locator('[data-testid="slash-menu"] [data-slash-item]').nth(1).tap();
    await expect(page.locator('[data-testid="slash-menu"]')).toHaveCount(0);
    await expect(page.locator('[data-inkbrick-block="heading"]')).toHaveCount(1);
  });

  test('a select is a sheet over a backdrop: an option applies, the backdrop closes', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await useTool(page, 'load-sample');

    const trigger = page.locator('[data-inkbrick-block="code"] [aria-haspopup="listbox"]').first();

    await trigger.scrollIntoViewIfNeeded();
    await trigger.tap();
    atBottom(await sheet(page, '[data-inkbrick-ui="select"]'));
    await page.locator('[data-inkbrick-ui="select"] [data-value="json"]').tap();
    await expect(trigger).toContainText('JSON');

    await trigger.tap();
    await expect(page.locator('[data-inkbrick-ui="select"]')).toHaveAttribute('data-sheet', 'true');
    await page.mouse.click(200, 80);
    await expect(page.locator('[data-inkbrick-ui="select"]')).toHaveCount(0);
    await expect(trigger).toContainText('JSON');
  });

  test('find and the command palette open as sheets at the bottom', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator('.editable').first().tap();
    await page.keyboard.press('Control+f');
    atBottom(await sheet(page, '[data-testid="find-panel"]'));
    await page.keyboard.press('Escape');

    await page.locator('.editable').first().tap();
    await page.keyboard.press('Control+Shift+p');
    atBottom(await sheet(page, '[data-testid="command-palette"]'));
  });
});
