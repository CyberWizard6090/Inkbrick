import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const handle = '[data-testid="block-handle"]';
const menu = '[data-testid="block-menu"]';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

async function openMenu(page: Page, index: number) {
  await page.locator(editable).nth(index).hover();
  await expect(page.locator(handle)).toBeVisible();
  await page.locator(`${handle} [data-action="grip"]`).click();
  await expect(page.locator(menu)).toBeVisible();
}

const block = (page: Page, index: number) =>
  page.locator('[data-inkbrick-block="paragraph"], [data-inkbrick-block="heading"]').nth(index);

test.describe('Block background', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['first', 'second']);
  });

  test('the handle of a painted block stands at the same place as the one of a plain block, not compact', async ({
    page,
  }) => {
    const handleBox = async (index: number) => {
      await page.locator(editable).nth(index).hover();
      await expect(page.locator(handle)).toBeVisible();

      return (await page.locator(handle).boundingBox())!;
    };

    const plain = await handleBox(0);

    await openMenu(page, 1);
    await page.locator(`${menu} [data-action="background-yellow"]`).click();
    await expect(block(page, 1)).toHaveAttribute('data-background', 'yellow');
    await page.mouse.move(2, 2);

    // Ручка появляется с лёгким сдвигом: сравниваем, когда анимация закончилась.
    await page.locator(editable).nth(1).hover();
    await expect(page.locator(handle)).toBeVisible();
    await expect
      .poll(async () => Math.abs((await page.locator(handle).boundingBox())!.x - plain.x), {
        timeout: 3000,
      })
      .toBeLessThanOrEqual(2);
    await expect(page.locator(handle)).not.toHaveAttribute('data-compact', /.*/);
  });

  test('the block menu paints a block, keeps its text in place and removes the background', async ({
    page,
  }) => {
    const before = (await page.locator(editable).nth(1).boundingBox())!;

    await openMenu(page, 1);
    await page.locator(`${menu} [data-action="background-yellow"]`).click();

    await expect(block(page, 1)).toHaveAttribute('data-background', 'yellow');
    await expect(block(page, 0)).not.toHaveAttribute('data-background', /.*/);
    await expect(page.locator(menu)).toBeHidden();

    const color = await block(page, 1).evaluate((node) => getComputedStyle(node).backgroundColor);

    expect(color).not.toBe('rgba(0, 0, 0, 0)');

    // Поля вынесены наружу: текст остаётся там же, где был.
    const after = (await page.locator(editable).nth(1).boundingBox())!;

    expect(Math.round(after.x)).toBe(Math.round(before.x));

    await openMenu(page, 1);
    await page.locator(`${menu} [data-action="background-none"]`).click();
    await expect(block(page, 1)).not.toHaveAttribute('data-background', /.*/);
  });

  test('the new palette colors are offered and paint the block differently per theme', async ({
    page,
  }) => {
    await openMenu(page, 1);

    for (const name of ['lime', 'teal', 'cyan', 'indigo', 'magenta'])
      await expect(page.locator(`${menu} [data-action="background-${name}"]`)).toBeVisible();

    // «Без фона», 14 цветов и «Свой цвет…»: два ровных ряда по восемь.
    const boxes = await page.locator(`${menu} [data-inkbrick-part="swatch"]`).evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y } = node.getBoundingClientRect();

        return { x: Math.round(x), y: Math.round(y) };
      }),
    );

    expect(boxes).toHaveLength(16);
    expect(new Set(boxes.map((box) => box.y)).size).toBe(2);
    expect(new Set(boxes.map((box) => box.x)).size).toBe(8);

    await page.locator(`${menu} [data-action="background-teal"]`).click();
    await expect(block(page, 1)).toHaveAttribute('data-background', 'teal');

    await page.evaluate(() =>
      document.documentElement.setAttribute('data-inkbrick-theme', 'light'),
    );

    const light = await block(page, 1).evaluate((n) => getComputedStyle(n).backgroundColor);

    expect(light).not.toBe('rgba(0, 0, 0, 0)');

    await page.evaluate(() => document.documentElement.setAttribute('data-inkbrick-theme', 'dark'));
    await expect
      .poll(() => block(page, 1).evaluate((n) => getComputedStyle(n).backgroundColor))
      .not.toBe(light);
  });

  test('"Custom color…" stores #rrggbb, draws the block, survives Enter and undo, and can be removed', async ({
    page,
  }) => {
    await openMenu(page, 1);
    await page.locator(`${menu} input[type="color"]`).fill('#12ab34');

    await expect(block(page, 1)).toHaveAttribute('data-background', 'custom');
    await expect(block(page, 1)).toHaveCSS('--inkbrick-block-background', '#12ab34');
    expect(await block(page, 1).evaluate((n) => getComputedStyle(n).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator(menu)).toBeHidden();

    const stored = await page.evaluate(() => {
      const snapshot = (window as any).__inkbrick.main.snapshot();

      return Object.values<any>(snapshot.blocks)
        .filter((b) => b.props.background)
        .map((b) => b.props.background);
    });

    expect(stored).toEqual(['#12ab34']);

    await page.locator(editable).nth(1).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(block(page, 2)).toHaveAttribute('data-background', 'custom');

    await page.keyboard.press(`${modifier}+z`);
    await expect(block(page, 1)).toHaveAttribute('data-background', 'custom');

    await openMenu(page, 1);
    await expect(page.locator(`${menu} [data-action="background-custom"]`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.locator(`${menu} [data-action="background-none"]`).click();
    await expect(block(page, 1)).not.toHaveAttribute('data-background', /.*/);
  });

  test('survives Enter, turning into a heading and undo', async ({ page }) => {
    await openMenu(page, 1);
    await page.locator(`${menu} [data-action="background-blue"]`).click();

    await page.locator(editable).nth(1).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(block(page, 2)).toHaveAttribute('data-background', 'blue');

    await page.keyboard.press(`${modifier}+z`);
    await expect(block(page, 1)).toHaveAttribute('data-background', 'blue');

    await page.keyboard.press('Home');
    await page.keyboard.type('/heading 1');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-inkbrick-block="heading"]')).toHaveAttribute(
      'data-background',
      'blue',
    );
  });
});
