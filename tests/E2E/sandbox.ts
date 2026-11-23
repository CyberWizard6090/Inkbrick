import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

export async function useTool(
  page: Page,
  id:
    | 'load-sample'
    | 'load-large'
    | 'add-unknown'
    | 'toggle-debug'
    | 'show-shortcuts'
    | 'export-json'
    | 'import-json'
    | 'reset-data',
) {
  await page.getByTestId('tools-menu').click();
  await page.getByTestId(id).click();
}

export async function openSettings(page: Page) {
  const button = page.getByTestId('settings-menu');

  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

export async function useSetting(page: Page, selector: string) {
  await openSettings(page);
  await page.locator(selector).click();
}

const isChromium = (context: BrowserContext) =>
  context.browser()?.browserType().name() === 'chromium';

/**
 * Доступ к системному буферу обмена (navigator.clipboard.read/write). Playwright выдаёт эти разрешения только
 * в Chromium; в Firefox и WebKit тест пропускается — логику копирования и вставки там проверяют юнит-тесты
 * на синтетических событиях (packages/react/tests/editing.test.tsx).
 */
export async function useSystemClipboard(context: BrowserContext) {
  test.skip(!isChromium(context), 'system clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

export function requireCdp(page: Page) {
  test.skip(!isChromium(page.context()), 'CDP (IME and touch emulation) is Chromium-only');
}

/**
 * Свой цвет через выбор цвета: открывает «Свой цвет…» внутри `scope`, вводит `hex` (шесть или восемь цифр) в поле HEX и
 * нажимает «Применить».
 */
export async function pickCustomColor(scope: Locator, hex: string) {
  await scope.locator('[data-inkbrick-part="swatch"][data-color="custom"]').click();

  const field = scope.locator('[data-inkbrick-part="color-field"]');

  await expect(field).toBeVisible();
  await field.fill(hex);
  await field.press('Tab');
  await scope.locator('[data-inkbrick-part="color-apply"]').click();
}
