import { test, expect, type Page } from '@playwright/test';

import { useTool, useSystemClipboard } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const readMode = '[data-testid="mode-read"]';
const editMode = '[data-testid="mode-edit"]';

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
      getSelection()!.setBaseAndExtent(a, ao, b, bo);
    },
    [from, to] as const,
  );
}

test.describe('Read-only mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await useTool(page, 'load-sample');
    await page.getByTestId('mode-read').click();
  });

  test('the document is not editable and typing changes nothing', async ({ page }) => {
    const before = await texts(page);
    const bold = await page.locator('strong').count();

    await expect(page.locator('.inkbrick-editor')).toHaveAttribute('contenteditable', 'false');
    await expect(page.locator('.inkbrick-editor')).toHaveAttribute('aria-readonly', 'true');

    await page.locator(editable).first().click();
    await page.keyboard.type('hello');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await page.keyboard.press(`${modifier}+B`);

    expect(await texts(page)).toEqual(before);
    await expect(page.locator('strong')).toHaveCount(bold);
  });

  test('no editing UI: toolbar, block handles and slash menu stay away', async ({ page }) => {
    await selectRange(page, [0, 0], [1, 5]);
    await page.locator(editable).nth(1).hover();

    await expect(page.locator('[data-testid="toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="block-handle"]')).toHaveCount(0);

    await page.locator(editable).first().click();
    await page.keyboard.type('/');
    await expect(page.locator('[data-testid="slash-menu"]')).toHaveCount(0);
  });

  test('controls inside blocks are disabled', async ({ page }) => {
    await expect(page.locator('.list-checkbox')).toBeDisabled();
    await expect(page.locator('.code-language')).toBeDisabled();

    await page.locator('.list-checkbox').click({ force: true });
    await expect(page.locator('.list-checkbox')).not.toBeChecked();
  });

  test('the engine refuses changes from code too, and undo does nothing', async ({ page }) => {
    const result = await page.evaluate(() => {
      const { editor } = (window as any).__inkbrick.main;
      const note = editor.document.getBlock(editor.document.rootId).children[0];
      const first = editor.document.getBlock(note).children[0];

      return {
        typed: editor.dispatch({
          type: 'replaceText',
          payload: { blockId: first, from: 0, to: 0, text: 'x' },
        }),
        deleted: editor.execute('delete-block', { id: first }),
        undo: editor.undo(),
        readOnly: editor.readOnly,
      };
    });

    expect(result).toEqual({ readOnly: true });
    expect((await texts(page))[0]).toBe('First paragraph');
  });

  test('text can still be selected across blocks and copied', async ({ page, context }) => {
    await useSystemClipboard(context);

    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+C`);

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());

    expect(clipboard).toContain('First paragraph');
    expect(clipboard).toContain('A heading');
    expect(clipboard).toContain('Last paragraph');
  });

  test('blocks report `selected` for the current selection and clear it afterwards', async ({
    page,
  }) => {
    await selectRange(page, [0, 2], [2, 3]);

    await expect(page.locator('[data-selected="true"]')).toHaveCount(3);

    await page.evaluate(() => getSelection()!.removeAllRanges());
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
  });

  test('links open in a new tab', async ({ page, context }) => {
    await page.evaluate(() => {
      const { editor } = (window as any).__inkbrick.main;
      const note = editor.document.getBlock(editor.document.rootId).children[0];
      const first = editor.document.getBlock(note).children[0];

      editor.setReadOnly(false);
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: {
          from: { blockId: first, offset: 0 },
          to: { blockId: first, offset: 5 },
          attributes: { link: '/?linked=1' },
        },
      });
      editor.setReadOnly(true);
    });

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator(editable).first().locator('a').click(),
    ]);

    expect(popup.url()).toContain('linked=1');
  });

  test('switching back to editing restores everything', async ({ page }) => {
    await page.locator(editMode).click();
    await expect(page.locator('.inkbrick-editor')).toHaveAttribute('contenteditable', 'true');
    await expect(page.locator('.list-checkbox')).toBeEnabled();

    await page.locator(editable).first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(page.locator(editable).first()).toHaveText('First paragraph!');

    await page.keyboard.press('Shift+Home');
    await expect(page.locator('[data-testid="toolbar"]')).toBeVisible();

    await page.locator('.list-checkbox').click();
    await expect(page.locator('.list-checkbox')).toBeChecked();

    await page.locator(readMode).click(); // снова только чтение
    await expect(page.locator('[data-testid="toolbar"]')).toHaveCount(0);
    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.locator(editable).first()).toHaveText('First paragraph!');
  });
});

test.describe('selected in editing mode', () => {
  test('a caret alone does not mark a block as selected', async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
    await page.keyboard.type('hello');

    await expect(page.locator('[data-selected="true"]')).toHaveCount(0);

    await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.locator('.block-paragraph[data-selected="true"]')).toHaveCount(1);
  });
});
