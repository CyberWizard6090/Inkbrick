import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

import { useTool } from './sandbox';

async function violations(page: Page) {
  // Меню и панели появляются плавно (100 мс): axe считает контраст по установившемуся виду, а не по полупрозрачному кадру.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );

  const result = await new AxeBuilder({ page })
    .include('.inkbrick-editor')
    .include('[data-inkbrick-ui]')
    .analyze();

  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

test.describe('Accessibility (axe)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?formatting=toolbar&lang=en');
    await useTool(page, 'load-sample');
  });

  test('the document with every block type', async ({ page }) => {
    expect(await violations(page)).toEqual([]);
  });

  test('read-only mode', async ({ page }) => {
    await page.getByTestId('mode-read').click();
    expect(await violations(page)).toEqual([]);
  });

  test('the color and highlight panels with every named color and a custom color', async ({
    page,
  }) => {
    const toolbar = '[data-testid="toolbar"]';

    await page.locator('.editable').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');

    for (const format of ['color', 'highlight']) {
      await page.locator(`${toolbar} [data-format="${format}"]`).click();
      expect(await violations(page)).toEqual([]);
    }

    // Выбран свой цвет: образец и индикатор с произвольным значением тоже проходят проверку.
    await page.locator(`${toolbar} [data-kind="highlight"] input[type="color"]`).fill('#12ab34');
    await page.locator(`${toolbar} [data-format="highlight"]`).click();
    expect(await violations(page)).toEqual([]);
  });

  test('the block menu with the background row and a custom background', async ({ page }) => {
    await page.locator('.editable').first().hover();
    await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();
    await expect(page.getByTestId('block-menu')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.locator('[data-testid="block-menu"] input[type="color"]').fill('#12ab34');
    await page.locator('.editable').first().hover();
    await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();
    await expect(page.getByTestId('block-menu')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('the new colors keep AA contrast against the page and the default text, in both themes', async ({
    page,
  }) => {
    const names = ['lime', 'teal', 'cyan', 'indigo', 'magenta'];
    const luminance = (css: string) => {
      const [r, g, b] = (css.match(/\d+/g) ?? []).slice(0, 3).map((v) => {
        const c = Number(v) / 255;

        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);

      return (hi + 0.05) / (lo + 0.05);
    };

    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-inkbrick-theme', value),
        theme,
      );

      const tokens = await page.evaluate((list) => {
        const read = (name: string) => {
          const probe = document.createElement('i');

          probe.style.color = `var(--inkbrick-${name})`;
          document.body.append(probe);

          const value = getComputedStyle(probe).color;

          probe.remove();

          return value;
        };

        return {
          page: read('bg-1'),
          fg: read('fg-1'),
          colors: list.map((name) => ({
            name,
            text: read(`color-${name}`),
            highlight: read(`highlight-${name}`),
          })),
        };
      }, names);

      for (const { name, text, highlight } of tokens.colors) {
        // Цвет текста на странице и текст по умолчанию на подсветке: WCAG AA для обычного текста — 4,5.
        expect(contrast(text, tokens.page), `${theme} ${name} text on page`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrast(tokens.fg, highlight),
          `${theme} ${name} default text on highlight`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('toolbar with the color panel, slash menu and block menu', async ({ page }) => {
    await page.locator('.editable').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.locator('[data-testid="toolbar"] [data-format="color"]').click();
    expect(await violations(page)).toEqual([]);

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.getByTestId('slash-menu')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await page.locator('.editable').first().hover();
    await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();
    await expect(page.getByTestId('block-menu')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
