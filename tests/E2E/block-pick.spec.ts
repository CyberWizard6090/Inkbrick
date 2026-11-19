import { test, expect, type Page } from '@playwright/test';

import { useSystemClipboard } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const handle = '[data-testid="block-handle"]';
const picked = '[data-picked]';
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

const texts = (page: Page) => page.locator(editable).allTextContents();

test.describe('Picking blocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['one', 'two', 'three', 'four']);
  });

  test('Escape picks the block, Shift+arrows extend, Escape again returns the caret', async ({
    page,
  }) => {
    await page.locator(editable).nth(1).click();
    await page.keyboard.press('Escape');
    await expect(page.locator(picked)).toHaveCount(1);

    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator(picked)).toHaveCount(2);

    await page.keyboard.press('Escape');
    await expect(page.locator(picked)).toHaveCount(0);

    await page.keyboard.type('!');
    await expect(page.locator(editable).nth(2)).toHaveText('three!');
  });

  test('Delete removes the picked blocks and Ctrl+Z brings them back', async ({ page }) => {
    await page.locator(editable).nth(1).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Delete');

    expect(await texts(page)).toEqual(['one', 'four']);

    await page.keyboard.press(`${modifier}+z`);
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);
  });

  test('Ctrl+D duplicates the run and Ctrl+Shift+arrows move it', async ({ page }) => {
    await page.locator(editable).first().click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');

    await page.keyboard.press(`${modifier}+d`);
    expect(await texts(page)).toEqual(['one', 'two', 'one', 'two', 'three', 'four']);

    await page.keyboard.press(`${modifier}+Shift+ArrowDown`);
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'one', 'two', 'four']);

    await page.keyboard.press(`${modifier}+Shift+ArrowUp`);
    expect(await texts(page)).toEqual(['one', 'two', 'one', 'two', 'three', 'four']);
  });

  test('a frame dragged in the gutter picks the blocks it touches', async ({ page }) => {
    const first = (await page.locator(editable).nth(1).boundingBox())!;
    const last = (await page.locator(editable).nth(2).boundingBox())!;

    // Поле левее документа (за краем корня).
    await page.mouse.move(60, first.y + 4);
    await page.mouse.down();
    await page.mouse.move(70, (first.y + last.y) / 2, { steps: 4 });
    await page.mouse.move(80, last.y + last.height - 4, { steps: 4 });
    await expect(page.locator('[data-inkbrick-ui="marquee"]')).toBeVisible();
    await page.mouse.up();

    await expect(page.locator('[data-inkbrick-ui="marquee"]')).toHaveCount(0);
    await expect(page.locator(picked)).toHaveCount(2);

    await page.keyboard.press('Delete');
    expect(await texts(page)).toEqual(['one', 'four']);
  });

  test('a click in the gutter still puts the caret on the line', async ({ page }) => {
    const second = (await page.locator(editable).nth(1).boundingBox())!;

    await page.mouse.click(60, second.y + 4);
    await page.keyboard.type('!');

    await expect(page.locator(picked)).toHaveCount(0);
    expect((await texts(page)).join('|')).toContain('!');
  });

  test('copy and paste take the whole picked blocks', async ({ page, context }) => {
    await useSystemClipboard(context);

    await page.locator(editable).first().click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press(`${modifier}+c`);

    await page.locator(editable).nth(3).click();
    await page.keyboard.press('End');
    await page.keyboard.press(`${modifier}+v`);

    expect(await texts(page)).toEqual(['one', 'two', 'three', 'fourone', 'two']);
  });

  test('dragging the handle of a picked run moves all of it', async ({ page }) => {
    await page.locator(editable).first().click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');

    await page.locator(editable).first().hover();
    await expect(page.locator(handle)).toBeVisible();

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const target = (await page.locator(editable).nth(3).boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 40, grip.y + grip.height / 2 + 12, { steps: 3 });
    await page.mouse.move(target.x + 30, target.y + target.height - 3, { steps: 6 });
    await page.mouse.up();

    expect(await texts(page)).toEqual(['three', 'four', 'one', 'two']);

    await page.keyboard.press(`${modifier}+z`);
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);
  });

  test('the block menu turns the picked run into a type and paints it, one undo each', async ({
    page,
  }) => {
    await page.locator(editable).nth(1).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');

    await page.locator(editable).nth(1).hover();
    await expect(page.locator(handle)).toBeVisible();
    await page.locator(`${handle} [data-action="grip"]`).click();
    await page.locator(`${menu} [data-action="quote"]`).click();

    await expect(page.locator('[data-inkbrick-block="quote"]')).toHaveCount(2);
    await expect(page.locator(picked)).toHaveCount(2);
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);

    await page.locator(editable).nth(2).hover();
    await page.locator(`${handle} [data-action="grip"]`).click();
    await page.locator(`${menu} [data-action="background-yellow"]`).click();

    await expect(page.locator('[data-background="yellow"]')).toHaveCount(2);

    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator('[data-background]')).toHaveCount(0);
    await expect(page.locator('[data-inkbrick-block="quote"]')).toHaveCount(2);

    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator('[data-inkbrick-block="quote"]')).toHaveCount(0);
    await expect(page.locator('[data-inkbrick-block="paragraph"]')).toHaveCount(4);
  });
});

const grip = `${handle} [data-action="grip"]`;

/** Клик по ручке блока с зажатой клавишей-модификатором (ручка следует за наведением, поэтому идём мышью). */
async function clickGrip(page: Page, index: number, key: 'Shift' | 'Control' | 'Meta') {
  await page.locator(editable).nth(index).hover();
  await expect(page.locator(handle)).toBeVisible();

  // hover() ждёт, пока ручка перестанет двигаться (она появляется с анимацией).
  await page.locator(grip).hover();
  await page.keyboard.down(key);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up(key);
}

test.describe('Picking blocks: fill, Ctrl+A, Shift and Ctrl clicks, frame', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['one', 'two', 'three', 'four']);
  });

  test('a picked block is a flat translucent blue fill: no ring, no shadow, keeps its own background', async ({
    page,
  }) => {
    await page.locator(editable).nth(1).click();
    await page.keyboard.press('Escape');

    const style = await page.locator(picked).evaluate((element) => {
      const css = getComputedStyle(element);

      return {
        shadow: css.boxShadow,
        outline: css.outlineStyle,
        border: css.borderTopWidth,
        image: css.backgroundImage,
        radius: css.borderTopLeftRadius,
        width: element.getBoundingClientRect().width,
        parent: element.parentElement!.getBoundingClientRect().width,
      };
    });

    expect(style.shadow).toBe('none');
    expect(style.outline).toBe('none');
    expect(style.border).toBe('0px');
    expect(style.image).toContain('rgba(35, 131, 227, 0.14)');
    expect(style.radius).not.toBe('0px');
    expect(style.width).toBeGreaterThan(style.parent * 0.9);
  });

  test('Ctrl+A selects the text of the block, the second press every block, Escape returns the caret', async ({
    page,
  }) => {
    await page.locator(editable).nth(1).click();
    await page.keyboard.press(`${modifier}+a`);
    await expect(page.locator(picked)).toHaveCount(0);
    expect(await page.evaluate(() => getSelection()!.toString())).toBe('two');

    await page.keyboard.press(`${modifier}+a`);
    await expect(page.locator(picked)).toHaveCount(4);

    await page.keyboard.press('Escape');
    await expect(page.locator(picked)).toHaveCount(0);
    await page.keyboard.type('!');
    expect((await texts(page)).join('|')).toContain('!');
  });

  test('Shift+click on a handle picks the range, Ctrl+click on a handle adds and removes blocks', async ({
    page,
  }) => {
    await page.locator(editable).first().click();
    await page.keyboard.press('Escape');

    await clickGrip(page, 2, 'Shift');
    await expect(page.locator(picked)).toHaveCount(3);
    await expect(page.locator(menu)).toHaveCount(0);

    await clickGrip(page, 1, modifier);
    await expect(page.locator(picked)).toHaveCount(2);

    await clickGrip(page, 3, modifier);
    await expect(page.locator(picked)).toHaveCount(3);

    await page.keyboard.press('Delete');
    expect(await texts(page)).toEqual(['two']);

    await page.keyboard.press(`${modifier}+z`);
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);
  });

  test('Shift+click in the text of another block extends the pick to it', async ({ page }) => {
    await page.locator(editable).first().click();
    await page.keyboard.press('Escape');
    await page
      .locator(editable)
      .nth(2)
      .click({ modifiers: ['Shift'] });

    await expect(page.locator(picked)).toHaveCount(3);
  });

  test('a click on the page outside the editor drops the pick', async ({ page }) => {
    await page.locator(editable).first().click();
    await page.keyboard.press('Escape');
    await expect(page.locator(picked)).toHaveCount(1);

    await page.mouse.click(5, 5);
    await expect(page.locator(picked)).toHaveCount(0);
  });

  test('a frame picks blocks while it is dragged and again as it shrinks', async ({ page }) => {
    const first = (await page.locator(editable).first().boundingBox())!;
    const third = (await page.locator(editable).nth(2).boundingBox())!;

    await page.mouse.move(60, first.y + 4);
    await page.mouse.down();
    await page.mouse.move(70, third.y + 4, { steps: 5 });
    await expect(page.locator(picked)).toHaveCount(3);

    await page.mouse.move(70, first.y + 4, { steps: 5 });
    await expect(page.locator(picked)).toHaveCount(1);
    await page.mouse.up();

    await expect(page.locator(picked)).toHaveCount(1);
  });

  test('typing over a picked block changes nothing; Enter returns the caret to its start', async ({
    page,
  }) => {
    await page.locator(editable).nth(1).click();
    await page.keyboard.press('Escape');
    await page.keyboard.type('xyz');
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);

    await page.keyboard.press('Enter');
    await page.keyboard.type('!');
    expect(await texts(page)).toEqual(['one', '!two', 'three', 'four']);
  });
});
