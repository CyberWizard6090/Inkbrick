import { test, expect, type Page } from '@playwright/test';

import { useTool } from './sandbox';

const SIZE = 50_000;
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const handle = '[data-testid="block-handle"]';

const modelIds = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window.__inkbrick!.main;
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];

    return editor.document.getBlock(note)!.children;
  });

const textOf = (page: Page, id: string) =>
  page.evaluate(
    (blockId) =>
      window
        .__inkbrick!.main.editor.document.getBlock(blockId)!
        .content.map((node) => node.insert)
        .join(''),
    id,
  );

const domBlocks = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.inkbrick-editor [data-block-id]').length);

const caretBlock = (page: Page) =>
  page.evaluate(() => {
    const node = getSelection()?.anchorNode;
    const element = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);

    return element?.closest<HTMLElement>('.editable')?.dataset.id ?? null;
  });

async function scrollTo(page: Page, y: number | 'middle') {
  await page.evaluate((target) => {
    window.scrollTo(
      0,
      target === 'middle' ? document.documentElement.scrollHeight / 2 : (target as number),
    );
  }, y);
  await expect.poll(() => visibleParagraphs(page).then((ids) => ids.length)).toBeGreaterThan(3);
}

const visibleParagraphs = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-inkbrick-block="paragraph"]')]
      .filter((block) => {
        const rect = block.getBoundingClientRect();

        return rect.top > 80 && rect.bottom < window.innerHeight - 40;
      })
      .map((block) => block.getAttribute('data-block-id')!),
  );

const block = (page: Page, id: string) => page.locator(`.editable[data-id="${id}"]`);

test.describe('Large document (virtual renderer)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await useTool(page, 'load-large');
    await expect(block(page, 'large-0')).toBeVisible();
  });

  test('opens 50 000 blocks with only a window of them in the DOM', async ({ page }) => {
    expect(await modelIds(page)).toHaveLength(SIZE);
    expect(await domBlocks(page)).toBeLessThan(300);
    await expect(block(page, `large-${SIZE - 1}`)).toHaveCount(1);
  });

  test('scrolling draws the blocks near the viewport', async ({ page }) => {
    await scrollTo(page, 'middle');

    const visible = await visibleParagraphs(page);
    const index = Number(visible[0].replace('large-', ''));

    expect(index).toBeGreaterThan(SIZE * 0.3);
    expect(index).toBeLessThan(SIZE * 0.7);
    expect(await domBlocks(page)).toBeLessThan(300);

    await scrollTo(page, 0);
    await expect(block(page, 'large-1')).toBeInViewport();
  });

  test('typing and Enter work in the middle of the document', async ({ page }) => {
    await scrollTo(page, 'middle');

    const [id] = await visibleParagraphs(page);
    const before = await textOf(page, id);

    await block(page, id).click({ position: { x: 2, y: 4 } });
    await page.keyboard.type('Hello ');
    await expect.poll(() => textOf(page, id)).toBe(`Hello ${before}`);

    await page.keyboard.press('Enter');
    await page.keyboard.type('Next');

    const ids = await modelIds(page);
    const at = ids.indexOf(id);

    expect(ids).toHaveLength(SIZE + 1);
    expect(await textOf(page, id)).toBe('Hello ');
    expect(await textOf(page, ids[at + 1])).toBe(`Next${before}`);
    expect(await caretBlock(page)).toBe(ids[at + 1]);
  });

  test('the block with the caret stays rendered while scrolled away; typing scrolls back', async ({
    page,
  }) => {
    await scrollTo(page, 'middle');

    const [id] = await visibleParagraphs(page);

    await block(page, id).click({ position: { x: 2, y: 4 } });
    await scrollTo(page, 200);
    await expect(block(page, id)).toHaveCount(1);
    await expect(block(page, id)).not.toBeInViewport();

    await page.keyboard.type('Z');
    await expect.poll(() => textOf(page, id)).toMatch(/^Z/);
    await expect(block(page, id)).toBeInViewport();
  });

  test('Ctrl+A selects the whole document and copy takes every block', async ({ page }) => {
    await scrollTo(page, 'middle');
    await block(page, (await visibleParagraphs(page))[0]).click();
    await page.keyboard.press(`${modifier}+a`);

    const copied = await page.evaluate(() => {
      const range = getSelection()!.getRangeAt(0);
      const id = (node: Node) =>
        (node.nodeType === 1 ? (node as Element) : node.parentElement)!.closest<HTMLElement>(
          '.editable',
        )!.dataset.id;
      const data = new DataTransfer();

      document
        .querySelector('.inkbrick-editor')!
        .dispatchEvent(
          Object.defineProperty(
            new Event('copy', { bubbles: true, cancelable: true }),
            'clipboardData',
            { value: data },
          ),
        );

      return {
        from: id(range.startContainer),
        to: id(range.endContainer),
        blocks: JSON.parse(data.getData('application/x-inkbrick-fragment')).blocks.length as number,
        text: data.getData('text/plain'),
      };
    });

    expect(copied.from).toBe('large-0');
    expect(copied.to).toBe(`large-${SIZE - 1}`);
    expect(copied.blocks).toBeGreaterThanOrEqual(SIZE);
    expect(copied.text).toContain(`Block ${SIZE - 1}:`);
  });

  test('undo puts the caret back into a block outside the window', async ({ page }) => {
    await block(page, 'large-1').click({ position: { x: 2, y: 4 } });
    await page.keyboard.type('Q');
    await expect.poll(() => textOf(page, 'large-1')).toMatch(/^Q/);

    await scrollTo(page, 'middle');
    await block(page, (await visibleParagraphs(page))[0]).click();
    await expect(block(page, 'large-1')).toHaveCount(0);

    await page.keyboard.press(`${modifier}+z`);

    await expect.poll(() => textOf(page, 'large-1')).toMatch(/^Block 1:/);
    await expect(block(page, 'large-1')).toBeInViewport();
    await expect.poll(() => caretBlock(page)).toBe('large-1');
  });

  test('a block can be dragged inside the large document', async ({ page }) => {
    await scrollTo(page, 'middle');

    const [from, , to] = await visibleParagraphs(page);

    await block(page, from).hover();
    await expect(page.locator(handle)).toHaveAttribute('data-block', from);

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const target = (await block(page, to).boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 40, grip.y + grip.height / 2 + 12, { steps: 3 });
    await page.mouse.move(target.x + 30, target.y + target.height - 3, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const ids = await modelIds(page);

        return ids.indexOf(from) - ids.indexOf(to);
      })
      .toBe(1);
    expect(await modelIds(page)).toHaveLength(SIZE);
  });
});
