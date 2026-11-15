import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const root = '[data-inkbrick-root]';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

const texts = (page: Page) => page.locator(editable).allTextContents();

/** Убираем курсор из редактора, чтобы клик по полю точно ставил его заново. */
async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test.describe('Click beside the text', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('left of a line puts the caret at its start', async ({ page }) => {
    await typeBlocks(page, ['one', 'two']);
    await blur(page);

    const box = (await page.locator(root).boundingBox())!;
    const line = (await page.locator(editable).nth(1).boundingBox())!;

    await page.mouse.click(box.x + 4, line.y + line.height / 2);
    await page.keyboard.type('X');

    expect(await texts(page)).toEqual(['one', 'Xtwo']);
  });

  test('right of a line puts the caret at its end', async ({ page }) => {
    await typeBlocks(page, ['one', 'two']);
    await blur(page);

    const box = (await page.locator(root).boundingBox())!;
    const line = (await page.locator(editable).first().boundingBox())!;

    await page.mouse.click(box.x + box.width - 4, line.y + line.height / 2);
    await page.keyboard.type('X');

    expect(await texts(page)).toEqual(['oneX', 'two']);
  });

  test('outside the page, on the same height, works too', async ({ page }) => {
    await typeBlocks(page, ['one', 'two']);
    await blur(page);

    const page_ = (await page.locator('.playground-content').boundingBox())!;
    const line = (await page.locator(editable).nth(1).boundingBox())!;

    await page.mouse.click(page_.x - 12, line.y + line.height / 2);
    await page.keyboard.type('X');

    expect(await texts(page)).toEqual(['one', 'Xtwo']);
  });

  test('below the last block puts the caret at its end', async ({ page }) => {
    await typeBlocks(page, ['one', 'two']);
    await blur(page);

    const page_ = (await page.locator('.playground-content').boundingBox())!;
    const last = (await page.locator(editable).nth(1).boundingBox())!;

    await page.mouse.click(page_.x + 30, Math.min(last.y + 120, page_.y + page_.height - 4));
    await page.keyboard.type('X');

    expect(await texts(page)).toEqual(['one', 'twoX']);
  });

  test('left of a wrapped line puts the caret at the start of that visual line', async ({
    page,
  }) => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');

    await typeBlocks(page, [words]);
    await blur(page);

    // Индекс первого символа второй визуальной строки.
    const { index, y } = await page.evaluate(() => {
      const node = document.querySelector('.editable')!.firstChild!;
      const range = document.createRange();
      const top = (i: number) => {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        return range.getBoundingClientRect();
      };
      const first = top(0).top;

      for (let i = 1; i < node.textContent!.length; i++) {
        const rect = top(i);

        if (rect.top > first + 4 && node.textContent![i] !== ' ') {
          return { index: i, y: rect.top + rect.height / 2 };
        }
      }

      throw new Error('the paragraph did not wrap');
    });

    const box = (await page.locator(root).boundingBox())!;

    await page.mouse.click(box.x + 4, y);
    await page.keyboard.type('X');

    const text = (await texts(page))[0];

    expect(text.indexOf('X')).toBe(index);
  });

  test('dragging from the margin selects whole lines', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three']);
    await blur(page);

    const box = (await page.locator(root).boundingBox())!;
    const first = (await page.locator(editable).first().boundingBox())!;
    const third = (await page.locator(editable).nth(2).boundingBox())!;

    await page.mouse.move(box.x + 4, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 4, third.y + third.height / 2, { steps: 5 });
    await page.mouse.up();

    await page.keyboard.type('X');

    expect(await texts(page)).toEqual(['X']);
  });

  test('a click on text next to the editor keeps its own behaviour', async ({ page }) => {
    await typeBlocks(page, ['one']);
    await blur(page);

    await page.locator('.playground-header').click();

    await expect(page.locator(root)).not.toBeFocused();
  });
});
