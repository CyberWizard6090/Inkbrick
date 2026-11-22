import { test, expect, type Page } from '@playwright/test';

import { useTool } from '../E2E/sandbox';

/**
 * Нагрузочные сценарии в браузере: ввод и правка в документе из 50 000 блоков, вставка тысяч блоков, таблица
 * 100 × 20, сотни картинок в просмотре. Каждый замер включает отрисовку (ждём два кадра) и сравнивается с бюджетом;
 * `LOAD_BUDGET_SCALE` растягивает бюджеты на медленной машине. Запуск: `pnpm test:load:e2e`.
 */

const SCALE = Number(process.env.LOAD_BUDGET_SCALE ?? 1);
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const results: Array<{ scenario: string; ms: number; budget: number; longest: number }> = [];

// Сводка замеров — главный вывод нагрузочного прогона.
// eslint-disable-next-line no-console
test.afterAll(() => console.table(results));

/** Время, за которое страница отрисовала два кадра (то есть закончила всё начатое). */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

/** Начинает сбор долгих задач (больше 50 мс); `stop` отдаёт самую долгую. */
async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __longest: number; __observer?: PerformanceObserver };

    w.__longest = 0;
    w.__observer?.disconnect();
    w.__observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longest = Math.max(w.__longest, entry.duration);
    });
    w.__observer.observe({ type: 'longtask' });
  });

  return () =>
    page.evaluate(() => {
      const w = window as unknown as { __longest: number; __observer?: PerformanceObserver };

      w.__observer?.disconnect();

      return Math.round(w.__longest);
    });
}

async function measure(page: Page, scenario: string, budget: number, run: () => Promise<void>) {
  const stop = await watchLongTasks(page);
  const start = Date.now();

  await run();
  await settle(page);

  const ms = Date.now() - start;
  const longest = await stop();

  results.push({ scenario, ms, budget, longest });
  expect(ms, `${scenario}: ${ms} ms (budget ${budget * SCALE} ms)`).toBeLessThan(budget * SCALE);

  return { ms, longest };
}

const noteChildren = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window.__inkbrick!.main;
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];

    return editor.document.getBlock(note)!.children.length;
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

async function pasteText(page: Page, text: string) {
  await page.evaluate((value) => {
    const transfer = new DataTransfer();

    transfer.setData('text/plain', value);
    document.activeElement!.dispatchEvent(
      Object.defineProperty(
        new Event('paste', { bubbles: true, cancelable: true }),
        'clipboardData',
        { value: transfer },
      ),
    );
  }, text);
}

test.describe('50 000 blocks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await measure(page, 'open 50 000 blocks', 8000, async () => {
      await useTool(page, 'load-large');
      await expect(page.locator('.editable[data-id="large-0"]')).toBeVisible();
    });
    expect(await noteChildren(page)).toBe(50_000);
  });

  test('typing stays responsive', async ({ page }) => {
    const text = 'the quick brown fox jumps over the lazy dog '.repeat(3);

    await page.locator('.editable[data-id="large-10"]').click();
    await page.keyboard.press('End');

    const before = await textOf(page, 'large-10');
    const { ms, longest } = await measure(page, `type ${text.length} characters`, 6000, () =>
      page.keyboard.type(text),
    );

    // End ставит каретку в конец видимой строки длинного абзаца: текст вставлен целиком, место неважно.
    expect(await textOf(page, 'large-10')).toHaveLength(before.length + text.length);
    expect(await textOf(page, 'large-10')).toContain(text);
    // Каждая клавиша — не дольше кадра-двух в среднем, и ни одна не подвешивает страницу.
    expect(ms / text.length).toBeLessThan(40 * SCALE);
    expect(longest).toBeLessThan(250 * SCALE);
  });

  test('Enter and Backspace in the middle of the document', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));

    // Обычный абзац посреди экрана (в списке, цитате или коде Enter ведёт себя иначе).
    const middleParagraph = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('[data-inkbrick-block="paragraph"]')].find(
            (node) => {
              const box = node.getBoundingClientRect();

              return box.top > 100 && box.bottom < innerHeight - 100;
            },
          )?.dataset.blockId,
      );

    await expect.poll(middleParagraph).toBeTruthy();

    const id = (await middleParagraph())!;

    await page.locator(`.editable[data-id="${id}"]`).click();
    await page.keyboard.press('End');
    await measure(page, '50 × Enter', 5000, async () => {
      for (let i = 0; i < 50; i++) await page.keyboard.press('Enter');
    });
    expect(await noteChildren(page)).toBe(50_050);
    await measure(page, '50 × Backspace', 5000, async () => {
      for (let i = 0; i < 50; i++) await page.keyboard.press('Backspace');
    });
    expect(await noteChildren(page)).toBe(50_000);
  });

  test('pick every block, delete them and undo', async ({ page }) => {
    await page.locator('.editable[data-id="large-0"]').click();
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press(`${modifier}+a`);
    // Выбраны все блоки (в DOM из них только видимые).
    await expect(page.locator('[data-picked]').first()).toBeVisible();

    await measure(page, 'delete 50 000 picked blocks', 3000, () =>
      page.keyboard.press('Backspace'),
    );
    expect(await noteChildren(page)).toBe(1);

    await measure(page, 'undo the deletion', 5000, async () => {
      await page.evaluate(() => window.__inkbrick!.main.editor.undo());
      await expect(page.locator('.editable[data-id="large-0"]')).toHaveCount(1);
    });
    expect(await noteChildren(page)).toBe(50_000);
  });
});

test('paste 5000 paragraphs into an empty document', async ({ page }) => {
  await page.goto('/');
  await page.locator('.editable').first().click();
  // Два Ctrl+A выбирают все блоки, Backspace оставляет один пустой абзац.
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Backspace');
  expect(await noteChildren(page)).toBe(1);
  await page.locator('.editable').first().click();

  const lines = Array.from({ length: 5000 }, (_, i) => `Pasted line ${i}`);

  await measure(page, 'paste 5000 lines', 4000, async () => {
    await pasteText(page, lines.join('\n'));
    await expect.poll(() => noteChildren(page)).toBeGreaterThanOrEqual(5000);
  });

  await measure(page, 'undo the paste', 3000, async () => {
    await page.evaluate(() => void window.__inkbrick!.main.editor.undo());
  });
  expect(await noteChildren(page)).toBeLessThanOrEqual(2);
});

test('a table of 100 × 20 cells', async ({ page }) => {
  await page.goto('/');

  await measure(page, 'build and draw a 100 × 20 table', 8000, async () => {
    await page.evaluate(() => {
      const { editor } = window.__inkbrick!.main;
      const { document: doc } = editor;
      const note = doc.getBlock(doc.rootId)!.children[0];
      const caret = editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:table', afterId: doc.getBlock(note)!.children.at(-1)! },
      }) as { blockId: string };
      let table = doc.getBlock(caret.blockId)!;

      while (table.flavour !== 'block:table') table = doc.getBlock(table.parentId!)!;

      const size = () => {
        const rows = doc.getBlock(table.id)!.children;

        return [rows.length, doc.getBlock(rows[0])!.children.length];
      };
      const run = (type: string, payload: object) =>
        editor.dispatch({ type, payload: { blockId: table.id, ...payload } } as never);

      editor.batch(() => {
        while (size()[1] < 20) run('insertTableColumn', { index: size()[1] });
        while (size()[0] < 100) run('insertTableRow', { index: size()[0] });
      });
    });
    await expect(
      page.locator('[data-inkbrick-block="table"] td, [data-inkbrick-block="table"] th'),
    ).toHaveCount(2000);
  });

  const cell = page.locator('[data-inkbrick-block="table"] td .editable').nth(500);

  await cell.click();

  const { ms, longest } = await measure(page, 'type 60 characters in a cell', 4000, () =>
    page.keyboard.type('x'.repeat(60)),
  );

  expect(ms / 60).toBeLessThan(40 * SCALE);
  expect(longest).toBeLessThan(250 * SCALE);
  await expect(cell).toHaveText('x'.repeat(60));
});

test('300 images: draw them and walk through all of them in the viewer', async ({ page }) => {
  const COUNT = 300;

  await page.goto('/');

  await measure(page, `insert and draw ${COUNT} images`, 6000, async () => {
    await page.evaluate((count) => {
      const canvas = document.createElement('canvas');

      canvas.width = 40;
      canvas.height = 30;

      const context = canvas.getContext('2d')!;
      const { editor } = window.__inkbrick!.main;
      const note = editor.document.getBlock(editor.document.rootId)!.children[0];
      let after = editor.document.getBlock(note)!.children.at(-1)!;

      editor.batch(() => {
        for (let i = 0; i < count; i++) {
          context.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`;
          context.fillRect(0, 0, 40, 30);
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
    }, COUNT);
    await expect(page.locator('[data-inkbrick-block="image"]').first()).toBeVisible();
  });

  await page.locator('[data-inkbrick-part="figure"]').first().hover();
  await page.getByRole('button', { name: 'View full size' }).first().click();

  const viewer = page.getByRole('dialog', { name: 'Image viewer' });

  await expect(viewer.locator('img')).toHaveAttribute('alt', 'image 0');

  const { ms } = await measure(page, `viewer: next × ${COUNT - 1}`, 8000, async () => {
    for (let i = 1; i < COUNT; i++) await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('img')).toHaveAttribute('alt', `image ${COUNT - 1}`);
  });

  expect(ms / COUNT).toBeLessThan(25 * SCALE);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
});
