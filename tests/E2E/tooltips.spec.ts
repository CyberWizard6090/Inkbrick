import { test, expect, type Locator, type Page } from '@playwright/test';

const editable = '.editable';
const tooltip = '[data-inkbrick-ui="tooltip"]';
const handle = '[data-testid="block-handle"]';

async function setup(page: Page) {
  await page.goto('/?lang=en');
  await page.locator(editable).first().click();
  await page.keyboard.type('before');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');
  await page.mouse.move(2, 2);
}

/** Указатель встаёт на элемент и ждёт подсказку. */
async function point(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
}

const look = (page: Page) =>
  page.locator(tooltip).evaluate((node) => {
    const style = getComputedStyle(node);

    return {
      background: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize,
      radius: style.borderRadius,
    };
  });

async function rowInsert(page: Page) {
  const cell = page.locator('[data-inkbrick-block="table"] td').nth(4);

  await point(page, cell);

  return page.locator('[data-inkbrick-part="row-insert"][data-edge="end"]');
}

test.describe('Tooltips', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('a table marker, the block handle and a code block share one tooltip look', async ({
    page,
  }) => {
    const marker = await rowInsert(page);

    await point(page, marker);
    await expect(page.locator(tooltip)).toHaveText('Insert row below');
    await expect(page.locator(tooltip)).toHaveAttribute('data-state', 'open');

    const table = await look(page);

    // Системной подсказки нет, доступное имя осталось.
    await expect(marker).not.toHaveAttribute('title', /.*/);
    await expect(marker).toHaveAttribute('aria-label', 'Insert row below');

    await page.locator(editable).first().hover();
    await point(page, page.locator(`${handle} [data-action="grip"]`));
    await expect(page.locator(tooltip)).toHaveText(/Drag to move/);
    expect(await look(page)).toEqual(table);

    await page.locator(editable).first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/code');
    await page.keyboard.press('Enter');
    await page.mouse.move(2, 2);
    await point(page, page.locator('[data-inkbrick-block="code"] [data-inkbrick-part="collapse"]'));
    await expect(page.locator(tooltip)).toHaveText(/Collapse|Expand/);
    expect(await look(page)).toEqual(table);
  });

  test('stays inside the window and does not cover the button it explains', async ({ page }) => {
    const marker = await rowInsert(page);

    await point(page, marker);
    await expect(page.locator(tooltip)).toBeVisible();

    const tip = (await page.locator(tooltip).boundingBox())!;
    const own = (await marker.boundingBox())!;
    const width = page.viewportSize()!.width;

    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(width);
    expect(tip.y + tip.height <= own.y || tip.y >= own.y + own.height).toBe(true);
  });

  test('hides when the pointer leaves, on a press and on Escape', async ({ page }) => {
    const marker = await rowInsert(page);

    await point(page, marker);
    await expect(page.locator(tooltip)).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(page.locator(tooltip)).toHaveCount(0);

    await rowInsert(page);
    await point(page, marker);
    await expect(page.locator(tooltip)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(tooltip)).toHaveCount(0);

    await page.mouse.move(2, 2);
    await rowInsert(page);
    await point(page, marker);
    await expect(page.locator(tooltip)).toBeVisible();
    await page.mouse.down();
    await expect(page.locator(tooltip)).toHaveCount(0);
    await page.mouse.up();
  });

  test('uses the colours of the dark theme', async ({ page }) => {
    const marker = await rowInsert(page);

    await point(page, marker);
    await expect(page.locator(tooltip)).toBeVisible();

    const light = await look(page);

    await page.mouse.move(2, 2);
    await page.emulateMedia({ colorScheme: 'dark' });
    await rowInsert(page);
    await point(page, marker);
    await expect(page.locator(tooltip)).toBeVisible();

    const dark = await look(page);

    expect(dark.background).not.toBe(light.background);
  });
});
