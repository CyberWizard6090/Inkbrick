import { test, expect, type Page } from '@playwright/test';

import { pickCustomColor } from './sandbox';

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

  test('the block menu paints a block flush with the other blocks and removes the background', async ({
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

    // Плашка вровень с другими блоками (как код и выноска), текст внутри неё — с отступом 8 px.
    const after = (await page.locator(editable).nth(1).boundingBox())!;
    const plate = (await block(page, 1).boundingBox())!;
    const plain = (await block(page, 0).boundingBox())!;

    expect(Math.round(plate.x)).toBe(Math.round(plain.x));
    expect(Math.round(plate.width)).toBe(Math.round(plain.width));
    expect(Math.round(after.x)).toBe(Math.round(before.x) + 8);

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

  test('"Custom color…" stores #rrggbbaa from the colour picker, draws the block as chosen, survives Enter and undo, and can be removed', async ({
    page,
  }) => {
    await openMenu(page, 1);
    // Меню блока не закрывается, пока открыт выбор цвета: квадрат двигается стрелками, а не меню.
    await page.locator(`${menu} [data-color="custom"]`).click();
    await page.locator(`${menu} [data-inkbrick-part="color-area"]`).press('ArrowDown');
    await expect(page.locator(menu)).toBeVisible();
    await page.locator(`${menu} [data-inkbrick-part="color-cancel"]`).click();
    await pickCustomColor(page.locator(menu), '12ab3480');

    await expect(block(page, 1)).toHaveAttribute('data-background', 'custom-alpha');
    await expect(block(page, 1)).toHaveCSS('--inkbrick-block-background', '#12ab3480');
    await expect(block(page, 1)).toHaveCSS('background-color', 'rgba(18, 171, 52, 0.5)');
    await expect(page.locator(menu)).toBeHidden();

    const stored = await page.evaluate(() => {
      const snapshot = (window as any).__inkbrick.main.snapshot();

      return Object.values<any>(snapshot.blocks)
        .filter((b) => b.props.background)
        .map((b) => b.props.background);
    });

    expect(stored).toEqual(['#12ab3480']);

    await page.locator(editable).nth(1).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(block(page, 2)).toHaveAttribute('data-background', 'custom-alpha');

    await page.keyboard.press(`${modifier}+z`);
    await expect(block(page, 1)).toHaveAttribute('data-background', 'custom-alpha');

    await openMenu(page, 1);
    await expect(page.locator(`${menu} [data-action="background-custom"]`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.locator(`${menu} [data-action="background-none"]`).click();
    await expect(block(page, 1)).not.toHaveAttribute('data-background', /.*/);
  });

  test('the colour picker works with the mouse: area, hue and opacity drags, the RGB fields, the field gets focus by a click', async ({
    page,
  }) => {
    await openMenu(page, 1);
    await page.locator(`${menu} [data-color="custom"]`).click();

    const part = (name: string) => page.locator(`${menu} [data-inkbrick-part="${name}"]`);
    const area = (await part('color-area').boundingBox())!;
    const hue = (await part('color-hue').boundingBox())!;
    const alpha = (await part('color-alpha').boundingBox())!;

    // Правый верхний угол квадрата — чистый цвет; оттенок на трети полосы — зелёный; прозрачность — половина.
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width + 20, area.y - 20, { steps: 4 });
    await page.mouse.up();
    await page.mouse.click(hue.x + hue.width / 3, hue.y + hue.height / 2);
    await page.mouse.click(alpha.x + alpha.width / 2, alpha.y + alpha.height / 2);

    await expect(part('color-field')).toHaveValue('00FF00');
    await expect(part('color-opacity')).toHaveValue('50%');
    await expect(page.locator(menu)).toBeVisible();

    // Формат RGB: три поля; щелчок ставит в поле курсор (меню не отменяет нажатие мыши по полю).
    await part('color-format').selectOption('rgb');
    await expect(part('color-field')).toHaveCount(3);
    await part('color-field').nth(2).click();
    await expect(part('color-field').nth(2)).toBeFocused();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.type('255');
    await page.keyboard.press('Enter');

    const stored = await page.evaluate(() => {
      const snapshot = (window as any).__inkbrick.main.snapshot();

      return Object.values<any>(snapshot.blocks)
        .filter((b) => b.props.background)
        .map((b) => b.props.background);
    });

    expect(stored).toEqual(['#00ffff80']);
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
