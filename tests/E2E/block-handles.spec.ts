import { test, expect, type Page } from '@playwright/test';

import { useTool } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const handle = '[data-testid="block-handle"]';
const menu = '[data-testid="block-menu"]';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

const texts = (page: Page) => page.locator(editable).allTextContents();

async function hoverBlock(page: Page, index: number) {
  await page.locator(editable).nth(index).hover();
  await expect(page.locator(handle)).toBeVisible();
  const id = await page.locator(editable).nth(index).getAttribute('data-id');
  await expect(page.locator(handle)).toHaveAttribute(
    'data-block',
    await page.evaluate(
      (blockId) =>
        document
          .querySelector(`.editable[data-id="${blockId}"]`)!
          .closest('[data-block-id]')!
          .getAttribute('data-block-id')!,
      id,
    ),
  );
}

async function openMenu(page: Page, index: number) {
  await hoverBlock(page, index);
  await page.locator(`${handle} [data-action="grip"]`).click();
  await expect(page.locator(menu)).toBeVisible();
}

async function dragBlock(
  page: Page,
  from: number,
  to: number,
  half: 'top' | 'bottom',
  release = true,
) {
  await hoverBlock(page, from);

  const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
  const target = (await page.locator(editable).nth(to).boundingBox())!;

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 40, grip.y + grip.height / 2 + 12, { steps: 3 });
  await page.mouse.move(
    target.x + 30,
    half === 'top' ? target.y + 3 : target.y + target.height - 3,
    { steps: 6 },
  );

  if (release) await page.mouse.up();
}

test.describe('Block handle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('follows the hovered block and disappears outside the editor', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three']);

    await hoverBlock(page, 0);
    const first = (await page.locator(handle).boundingBox())!;

    await hoverBlock(page, 2);
    const third = (await page.locator(handle).boundingBox())!;

    expect(third.y).toBeGreaterThan(first.y + 20);

    await page.mouse.move(2, 2);
    await expect(page.locator(handle)).toHaveCount(0);
  });

  test('can be reached from the gutter without disappearing', async ({ page }) => {
    await typeBlocks(page, ['one', 'two']);
    await hoverBlock(page, 1);

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const text = (await page.locator(editable).nth(1).boundingBox())!;

    await page.mouse.move(text.x + 4, text.y + 8);
    await page.mouse.move(text.x - 20, text.y + 8, { steps: 4 });
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 4 });

    await expect(page.locator(handle)).toBeVisible();
    await expect(page.locator(handle)).toHaveAttribute('data-block', /.+/);
  });

  test('hides while typing', async ({ page }) => {
    await typeBlocks(page, ['one']);
    await hoverBlock(page, 0);

    await page.locator(editable).first().click();
    await page.keyboard.type('x');

    await expect(page.locator(handle)).toHaveCount(0);
  });

  test('has a handle for a divider too', async ({ page }) => {
    await typeBlocks(page, ['--- ']);

    await page.locator('.block-divider').hover();
    await expect(page.locator(handle)).toBeVisible();
  });
});

test.describe('Block menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await typeBlocks(page, ['one', 'two', 'three']);
  });

  test('Duplicate copies the block right below it', async ({ page }) => {
    await openMenu(page, 1);
    await page.locator('[data-action="duplicate"]').click();

    expect(await texts(page)).toEqual(['one', 'two', 'two', 'three']);
    await expect(page.locator(menu)).toHaveCount(0);
  });

  test('Move up / down reorder blocks; the edge moves are disabled', async ({ page }) => {
    await openMenu(page, 0);
    await expect(page.locator('[data-action="move-up"]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-action="move-down"]').click();
    expect(await texts(page)).toEqual(['two', 'one', 'three']);

    await openMenu(page, 2);
    await expect(page.locator('[data-action="move-down"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.locator('[data-action="move-up"]').click();
    expect(await texts(page)).toEqual(['two', 'three', 'one']);
  });

  test('Delete removes the block; deleting the last block leaves an empty paragraph', async ({
    page,
  }) => {
    await openMenu(page, 1);
    await page.locator('[data-action="delete"]').click();
    expect(await texts(page)).toEqual(['one', 'three']);

    await openMenu(page, 0);
    await page.locator('[data-action="delete"]').click();
    await openMenu(page, 0);
    await page.locator('[data-action="delete"]').click();

    expect(await texts(page)).toEqual(['']);
  });

  test('Turn into converts the block and keeps its text', async ({ page }) => {
    await openMenu(page, 1);
    await page.locator('[data-action="heading-2"]').click();

    await expect(page.locator('.block-heading.level-2 .editable')).toHaveText('two');
    expect(await texts(page)).toEqual(['one', 'two', 'three']);
  });

  test('scrolling inside a long menu does not close it', async ({ page }) => {
    await openMenu(page, 1);

    const scrolled = await page.evaluate((selector) => {
      const element = document.querySelector<HTMLElement>(selector)!;

      element.scrollTop = element.scrollHeight;

      return element.scrollTop;
    }, menu);

    // Меню длиннее 60vh прокручивается внутри себя; событие scroll не должно его закрывать.
    expect(scrolled).toBeGreaterThan(0);
    await page.waitForTimeout(100);
    await expect(page.locator(menu)).toBeVisible();
  });

  test('actions are undone in one step', async ({ page }) => {
    await openMenu(page, 1);
    await page.locator('[data-action="duplicate"]').click();
    expect(await texts(page)).toHaveLength(4);

    await page.keyboard.press(`${modifier}+Z`);
    expect(await texts(page)).toEqual(['one', 'two', 'three']);
  });

  test('closes on Escape and on a click outside, without changing anything', async ({ page }) => {
    await openMenu(page, 1);
    await page.keyboard.press('Escape');
    await expect(page.locator(menu)).toHaveCount(0);

    await openMenu(page, 1);
    await page.locator(editable).first().click();
    await expect(page.locator(menu)).toHaveCount(0);
    expect(await texts(page)).toEqual(['one', 'two', 'three']);
  });

  test('is operable from the keyboard', async ({ page }) => {
    await hoverBlock(page, 1);
    await page.locator(`${handle} [data-action="grip"]`).focus();
    await page.keyboard.press('Enter');

    await expect(page.locator(menu)).toBeVisible();
    await expect(page.locator('[data-action="duplicate"]')).toBeFocused();

    await page.keyboard.press('ArrowDown'); // Move up
    await page.keyboard.press('Enter');

    expect(await texts(page)).toEqual(['two', 'one', 'three']);
  });
});

test.describe('Add block below', () => {
  test('inserts a block below and opens the slash menu; the choice converts it', async ({
    page,
  }) => {
    await page.goto('/');
    await typeBlocks(page, ['one', 'two']);

    await hoverBlock(page, 0);
    await page.locator(`${handle} [data-action="add"]`).click();

    await expect(page.locator('[data-testid="slash-menu"]')).toBeVisible();
    expect(await texts(page)).toEqual(['one', '/', 'two']);

    await page.keyboard.type('quo');
    await page.keyboard.press('Enter');

    await expect(page.locator('.block-quote')).toHaveCount(1);
    expect(await texts(page)).toEqual(['one', '', 'two']);

    await page.keyboard.type('quoted');
    await expect(page.locator('.block-quote .editable')).toHaveText('quoted');
  });

  test('next to a nested list item it adds another list item, never a paragraph inside the list', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
    await page.keyboard.type('- a');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('b');

    await hoverBlock(page, 1);
    await page.locator(`${handle} [data-action="add"]`).click();
    await page.keyboard.press('Escape');

    await expect(page.locator('.block-nested-children .block-list')).toHaveCount(2);
    await expect(page.locator('.block-nested-children .block-paragraph')).toHaveCount(0);
  });
});

test.describe('Drag and drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await typeBlocks(page, ['one', 'two', 'three', 'four']);
  });

  test('dragging a handle shows the drop line and moves the block', async ({ page }) => {
    await dragBlock(page, 0, 2, 'bottom', false);

    await expect(page.locator('[data-testid="drop-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="drop-indicator"]')).toHaveAttribute(
      'data-position',
      'after',
    );

    await page.mouse.up();

    expect(await texts(page)).toEqual(['two', 'three', 'one', 'four']);
    await expect(page.locator('[data-testid="drop-indicator"]')).toHaveCount(0);
  });

  test('drops above a block when released over its upper half', async ({ page }) => {
    await dragBlock(page, 3, 1, 'top');

    expect(await texts(page)).toEqual(['one', 'four', 'two', 'three']);
  });

  test('dropping on itself or cancelling with Escape changes nothing', async ({ page }) => {
    await dragBlock(page, 1, 1, 'bottom');
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);

    await dragBlock(page, 0, 3, 'bottom', false);
    await page.keyboard.press('Escape');
    await page.mouse.up();

    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);
    await expect(page.locator('[data-testid="drop-indicator"]')).toHaveCount(0);
  });

  test('a drag is one undo step', async ({ page }) => {
    await dragBlock(page, 0, 3, 'bottom');
    expect(await texts(page)).toEqual(['two', 'three', 'four', 'one']);

    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+Z`);

    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);
  });

  test('a click without movement opens the menu instead of dragging', async ({ page }) => {
    await hoverBlock(page, 1);
    await page.locator(`${handle} [data-action="grip"]`).click();

    await expect(page.locator(menu)).toBeVisible();
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);
  });
});

test.describe('Nested blocks', () => {
  test('dragging a list item carries its children; a block cannot be dropped into its own subtree', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
    await page.keyboard.type('- a');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('a1');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('b');

    expect(await texts(page)).toEqual(['a', 'a1', 'b']);

    await dragBlock(page, 0, 1, 'bottom', false);
    await expect(page.locator('[data-testid="drop-indicator"]')).toHaveCount(0);
    await page.mouse.up();
    expect(await texts(page)).toEqual(['a', 'a1', 'b']);

    await dragBlock(page, 0, 2, 'bottom');
    expect(await texts(page)).toEqual(['b', 'a', 'a1']);
    await expect(page.locator('.block-nested-children .editable')).toHaveText('a1');
  });
});

test.describe('Special blocks', () => {
  test('an unknown block offers only Delete', async ({ page }) => {
    await page.goto('/');
    await useTool(page, 'add-unknown');
    const result = await page.evaluate(() => {
      const { editor } = (window as any).__inkbrick.main;
      return {
        duplicate: editor.can('duplicateBlock', { blockId: 'mystery-1' }),
        move: editor.can('moveBlock', {
          blockId: 'mystery-1',
          targetId: Object.keys(editor.document.dump()).find(
            (id) =>
              id !== 'mystery-1' && editor.document.getBlock(id).flavour === 'block:paragraph',
          ),
          position: 'after',
        }),
        convert: editor.can('convertBlock', { blockId: 'mystery-1', flavour: 'block:paragraph' }),
        remove: editor.can('delete-block', { id: 'mystery-1' }),
      };
    });

    expect(result).toEqual({ duplicate: false, move: false, convert: false, remove: true });
  });
});
