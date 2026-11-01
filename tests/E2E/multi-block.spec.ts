import { test, expect, type Page } from '@playwright/test';

import { useTool, useSystemClipboard } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

const texts = (page: Page) => page.locator(editable).allTextContents();

async function selectRange(page: Page, from: [number, number], to: [number, number]) {
  await page.evaluate(
    ([f, t]) => {
      const els = [...document.querySelectorAll('.editable')];
      const point = (el: Element, offset: number) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let rest = offset;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const len = n.textContent!.length;
          if (rest <= len) return [n, rest] as const;
          rest -= len;
        }
        return [el, 0] as const;
      };
      const [a, ao] = point(els[f[0]], f[1]);
      const [b, bo] = point(els[t[0]], t[1]);
      (document.querySelector('.inkbrick-editor') as HTMLElement).focus();
      getSelection()!.setBaseAndExtent(a, ao, b, bo);
    },
    [from, to] as const,
  );
}

test.describe('Selection across blocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Shift+ArrowUp extends the selection into the previous block; Backspace merges them', async ({
    page,
  }) => {
    await typeBlocks(page, ['hello', 'world']);

    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Backspace');

    await expect(page.locator(editable)).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('hello');
  });

  test('dragging the mouse from one block to another selects and deletes across them', async ({
    page,
  }) => {
    await typeBlocks(page, ['alpha', 'beta', 'gamma']);

    const first = (await page.locator(editable).nth(0).boundingBox())!;
    const last = (await page.locator(editable).nth(2).boundingBox())!;

    await page.mouse.move(first.x + 4, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width - 4, last.y + last.height / 2, { steps: 8 });
    await page.mouse.up();

    await page.keyboard.press('Backspace');

    await expect(page.locator(editable)).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('');
  });

  test('Ctrl/Cmd+A selects the whole document; Backspace leaves one empty paragraph', async ({
    page,
  }) => {
    await typeBlocks(page, ['one', 'two', 'three']);

    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press('Backspace');

    await expect(page.locator(editable)).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('');

    await page.keyboard.type('fresh');
    await expect(page.locator(editable).first()).toHaveText('fresh');
  });

  test('typing over a multi-block selection replaces it, and undo restores all blocks', async ({
    page,
  }) => {
    await typeBlocks(page, ['hello', 'middle', 'world']);
    await selectRange(page, [0, 2], [2, 3]);

    await page.keyboard.type('X');
    expect(await texts(page)).toEqual(['heXld']);

    await page.keyboard.press(`${modifier}+Z`);
    expect(await texts(page)).toEqual(['hello', 'middle', 'world']);

    await page.keyboard.press(`${modifier}+Shift+Z`);
    expect(await texts(page)).toEqual(['heXld']);
  });

  test('the caret is placed at the join point after deleting', async ({ page }) => {
    await typeBlocks(page, ['hello', 'world']);
    await selectRange(page, [0, 2], [1, 3]);

    await page.keyboard.press('Backspace');
    await page.keyboard.type('|');

    expect(await texts(page)).toEqual(['he|ld']);
  });

  test('Enter replaces the selection with a block break', async ({ page }) => {
    await typeBlocks(page, ['hello', 'world']);
    await selectRange(page, [0, 2], [1, 3]);

    await page.keyboard.press('Enter');

    expect(await texts(page)).toEqual(['he', 'ld']);

    await page.keyboard.press(`${modifier}+Z`);
    expect(await texts(page)).toEqual(['hello', 'world']);
  });

  test('bold applies to the selected parts of every block and toggles off', async ({ page }) => {
    await typeBlocks(page, ['abc', 'def', 'ghi']);
    await selectRange(page, [0, 1], [2, 2]);

    await page.keyboard.press(`${modifier}+B`);

    await expect(page.locator('.editable strong')).toHaveCount(3);
    expect(await page.locator('.editable strong').allTextContents()).toEqual(['bc', 'def', 'gh']);

    await page.keyboard.press(`${modifier}+B`);
    await expect(page.locator('.editable strong')).toHaveCount(0);
    expect(await texts(page)).toEqual(['abc', 'def', 'ghi']);
  });

  test('cut removes the selection and puts its text on the clipboard', async ({
    page,
    context,
  }) => {
    await useSystemClipboard(context);
    await typeBlocks(page, ['one', 'two']);
    await selectRange(page, [0, 1], [1, 2]);

    await page.keyboard.press(`${modifier}+X`);

    expect(await texts(page)).toEqual(['oo']);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('ne');
    expect(clipboard).toContain('tw');
  });

  test('pasting over a multi-block selection replaces it in one step', async ({
    page,
    context,
  }) => {
    await useSystemClipboard(context);
    await typeBlocks(page, ['hello', 'world']);
    await page.evaluate(() => navigator.clipboard.writeText('A\nB'));
    await selectRange(page, [0, 2], [1, 3]);

    await page.keyboard.press(`${modifier}+V`);

    expect(await texts(page)).toEqual(['heA', 'Bld']);

    await page.keyboard.press(`${modifier}+Z`);
    expect(await texts(page)).toEqual(['hello', 'world']);
  });

  test('a selection spanning list items keeps the first block type', async ({ page }) => {
    await page.locator(editable).first().click();
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.type('three');

    await selectRange(page, [0, 1], [2, 2]);
    await page.keyboard.press('Backspace');

    await expect(page.locator('.block-list')).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('oree');
  });

  test('a selection that covers an unknown block is left untouched', async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
    await page.keyboard.type('before');
    await useTool(page, 'add-unknown');

    await page.evaluate(() => {
      const { editor } = (window as any).__inkbrick.main;
      const note = editor.document.getBlock(editor.document.rootId).children[0];
      editor.store.transact((tx: any) => {
        const block = editor.engine.block.create({ flavour: 'block:paragraph', parentId: note });
        editor.engine.block.insert(tx, note, 2, block);
      });
    });

    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press('Backspace');

    await expect(page.locator('[data-unknown-flavour="block:mystery"]')).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('before');
  });

  test('typing in a collapsed caret still merges into one undo step (no batch overhead)', async ({
    page,
  }) => {
    await page.locator(editable).first().click();
    await page.keyboard.type('abcdef');
    await page.keyboard.press(`${modifier}+Z`);

    await expect(page.locator(editable).first()).toHaveText('');
  });
});
