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

  test('Ctrl+A twice picks the whole document and copy takes every block', async ({ page }) => {
    await scrollTo(page, 'middle');
    await block(page, (await visibleParagraphs(page))[0]).click();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press(`${modifier}+a`);

    const copied = await page.evaluate(() => {
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
        blocks: JSON.parse(data.getData('application/x-inkbrick-fragment')).blocks.length as number,
        text: data.getData('text/plain'),
      };
    });

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

  const fold = (page: Page, id: string) =>
    block(page, id).locator('xpath=..').locator('[data-inkbrick-part="fold"]').click();

  const heightOf = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);

  test('a folded part takes no room: the next heading follows its heading right away', async ({
    page,
  }) => {
    const before = await heightOf(page);

    // «Part 0» (h1) прячет 999 блоков до «Part 1»: больше, чем окно отрисовки (400), — следующий заголовок всё равно на экране.
    await fold(page, 'large-0');

    await expect.poll(async () => before - (await heightOf(page))).toBeGreaterThan(20000);
    await expect(block(page, 'large-1000')).toBeVisible();

    const gapBetween = () =>
      page.evaluate(() => {
        const heading = document
          .querySelector('.editable[data-id="large-0"]')!
          .getBoundingClientRect();
        const next = document
          .querySelector('.editable[data-id="large-1000"]')!
          .getBoundingClientRect();

        return next.top - heading.bottom;
      });

    // Блоки раздела на экране сжимаются с анимацией (~220 мс): ждём, пока промежуток закроется.
    await expect.poll(gapBetween, { timeout: 3000 }).toBeLessThan(40);

    const folded = await heightOf(page);

    await fold(page, 'large-0');
    // Развернули — раздел вернул своё место (до измеренных высот: оценка и измерение не совпадают в точности).
    await expect.poll(async () => (await heightOf(page)) - folded).toBeGreaterThan(20000);
  });

  test('folded headings one after another leave no gap: the next ones stay on the page', async ({
    page,
  }) => {
    // Сворачиваем «Part 0», затем «Part 1» и «Part 2» (каждый прячет 999 блоков): три подряд — почти 3000 скрытых.
    await fold(page, 'large-0');
    await expect(block(page, 'large-1000')).toBeVisible();
    await fold(page, 'large-1000');
    await expect(block(page, 'large-2000')).toBeVisible();
    await fold(page, 'large-2000');
    await expect(block(page, 'large-3000')).toBeVisible();

    const stepsOf = () =>
      page.evaluate(() => {
        const tops = ['large-0', 'large-1000', 'large-2000', 'large-3000'].map((id) =>
          Math.round(
            document.querySelector(`.editable[data-id="${id}"]`)!.getBoundingClientRect().top,
          ),
        );

        return tops.slice(1).map((top, i) => top - tops[i]);
      });

    // Заголовки идут вплотную друг за другом (шаг одной строки заголовка), без пустых промежутков: когда анимация кончилась.
    await expect
      .poll(async () => Math.max(...(await stepsOf())), { timeout: 3000 })
      .toBeLessThan(80);
  });

  test('a frame dragged in the gutter does not search all 50 000 blocks on every move', async ({
    page,
  }) => {
    await scrollTo(page, 'middle');

    const box = (await page.locator('.inkbrick-editor').first().boundingBox())!;
    const x = Math.max(5, box.x - 30);
    const height = page.viewportSize()!.height;

    await page.evaluate(() => {
      const counts = { query: 0, rects: 0 };
      const query = Element.prototype.querySelector;
      const rect = Element.prototype.getBoundingClientRect;

      Element.prototype.querySelector = function (this: Element, selector: string) {
        counts.query++;

        return query.call(this, selector);
      };
      Element.prototype.getBoundingClientRect = function (this: Element) {
        counts.rects++;

        return rect.call(this);
      };
      Object.assign(window, { __counts: counts });
    });

    await page.mouse.move(x, 100);
    await page.mouse.down();

    const moves = 40;

    // Рамка идёт по полю, а в конце заходит в текст: блоки выбираются, только когда рамка их задела.
    for (let i = 0; i < moves; i++) {
      const inText = i >= moves - 2;

      await page.mouse.move(inText ? box.x + 60 : x + (i % 2), 100 + ((height - 200) * i) / moves);
    }

    const counts = await page.evaluate(
      () => (window as unknown as { __counts: { query: number; rects: number } }).__counts,
    );

    await page.mouse.up();

    // Раньше на каждое движение шёл поиск по 50 000 блоков заметки: десятки тысяч обращений к DOM на одно движение.
    expect(counts.query).toBeLessThan(moves * 5);
    expect(counts.rects).toBeLessThan(moves * 600);
    expect(await page.locator('[data-picked]').count()).toBeGreaterThan(3);
  });

  test('Ctrl+A twice picks every block; blocks drawn later while scrolling come out picked', async ({
    page,
  }) => {
    await scrollTo(page, 'middle');
    await block(page, (await visibleParagraphs(page))[0]).click();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press(`${modifier}+a`);

    const marks = () =>
      page.evaluate(() => {
        const { editor } = window.__inkbrick!.main;
        const note = editor.document.getBlock(editor.document.rootId)!.children[0];
        const top = new Set(editor.document.getBlock(note)!.children);
        const blocks = [...document.querySelectorAll('.inkbrick-editor [data-block-id]')].filter(
          (element) => top.has(element.getAttribute('data-block-id')!),
        );

        return {
          all: blocks.length,
          picked: blocks.filter((b) => b.hasAttribute('data-picked')).length,
        };
      });

    await expect.poll(async () => (await marks()).picked).toBeGreaterThan(5);

    const first = await marks();

    expect(first.picked).toBe(first.all);

    await scrollTo(page, 3000);

    const later = await marks();

    expect(later.picked).toBe(later.all);

    await page.keyboard.press('Escape');
    await expect.poll(async () => (await marks()).picked).toBe(0);
  });

  test('the document has six heading levels and mixed blocks', async ({ page }) => {
    const kinds = await page.evaluate(() => {
      const { editor } = window.__inkbrick!.main;
      const levels = new Set<number>();
      const flavours = new Set<string>();

      for (const block of Object.values(editor.document.dump())) {
        flavours.add(block.flavour);

        if (block.flavour === 'block:heading') levels.add(Number(block.props.level));
      }

      return { levels: [...levels].sort(), flavours: [...flavours] };
    });

    expect(kinds.levels).toEqual([1, 2, 3, 4, 5, 6]);
    expect(kinds.flavours).toEqual(
      expect.arrayContaining(['block:quote', 'block:callout', 'block:list', 'block:code']),
    );
  });
});

test('hundreds of images (much shorter than estimated before they load) do not loop the renderer', async ({
  page,
}) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');

    canvas.width = 40;
    canvas.height = 30;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 30);

    const { editor } = window.__inkbrick!.main;
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    let after = editor.document.getBlock(note)!.children.at(-1)!;

    editor.batch(() => {
      for (let i = 0; i < 300; i++) {
        after = (
          editor.dispatch({
            type: 'insertBlock',
            payload: {
              flavour: 'block:image',
              afterId: after,
              props: { src: canvas.toDataURL('image/png'), alt: `image ${i}` },
            },
          }) as { blockId: string }
        ).blockId;
      }
    });
  });

  await expect(page.locator('[data-inkbrick-block="image"]').first()).toBeVisible();
  // Окно отрисовки дорастает до экрана по кадрам. Сколько картинок войдёт, зависит от браузера: где `data:` грузится
  // сразу, каждая растянута на всю ширину и их на экране несколько; где позже — десятки. Главное — без «Maximum update
  // depth exceeded» (до исправления страница пустела) и не все 300 в DOM.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(errors).toEqual([]);
  expect(await page.locator('[data-inkbrick-block="image"]').count()).toBeLessThan(300);
});
