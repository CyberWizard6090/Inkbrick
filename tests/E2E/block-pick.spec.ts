import { test, expect, type Page } from '@playwright/test';

import { useSystemClipboard } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const handle = '[data-testid="block-handle"]';
const picked = '[data-picked]';

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
});
