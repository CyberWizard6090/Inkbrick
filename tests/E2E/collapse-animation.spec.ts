import { test, expect, type Locator, type Page } from '@playwright/test';

import { useTool } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Сворачивание идёт 3 секунды: в это окно можно проверить, что блоки именно уходят, а не пропадают сразу. */
const SLOW = ':root { --inkbrick-collapse-duration: 3s; }';

const toggle = '[data-inkbrick-block="toggle"]';
const toggleButton = `${toggle} [data-inkbrick-part="toggle"]`;
const toggleKids = `${toggle} [data-inkbrick-part="children"]`;
const listFold =
  '[data-inkbrick-block="list"][data-foldable] > [data-inkbrick-part="row"] > [data-inkbrick-part="fold"]';
const listKids = '[data-inkbrick-block="list"] [data-inkbrick-part="children"]';
const heading = (page: Page, text: string) =>
  page.locator('[data-inkbrick-block="heading"]', { hasText: text });

const animations = (locator: Locator) =>
  locator.evaluate((element) => element.getAnimations().length);
const height = (locator: Locator) =>
  locator.evaluate((element) => Math.round(element.getBoundingClientRect().height));

async function toggleWithKids(page: Page) {
  await page.goto('/?lang=en');
  await page.addStyleTag({ content: SLOW });
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+End`);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/toggle');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Details');
  await page.keyboard.press('Enter');
  await page.keyboard.type('hidden one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('hidden two');
}

async function nestedList(page: Page) {
  await page.goto('/?lang=en');
  await page.addStyleTag({ content: SLOW });
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');
  await page.keyboard.type('- parent');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('child one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('child two');
}

async function outline(page: Page) {
  await page.goto('/?lang=en');
  await page.addStyleTag({ content: SLOW });
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+End`);
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Fold me');
  await page.keyboard.press('Enter');
  await page.keyboard.type('first inside');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second inside');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Stay visible');
}

test.describe('Collapse animation: toggle', () => {
  test('the content shrinks while it leaves and is removed afterwards; opening grows it back', async ({
    page,
  }) => {
    await toggleWithKids(page);

    const kids = page.locator(toggleKids);
    const full = await height(kids);

    expect(full).toBeGreaterThan(20);

    await page.locator(toggleButton).click();

    // Блоки ещё в дереве и сжимаются; у элемента идёт анимация, а `overflow` временно скрыт.
    await expect(kids).toHaveCount(1);
    expect(await animations(kids)).toBeGreaterThan(0);
    await expect.poll(() => height(kids), { timeout: 3000 }).toBeLessThan(full);
    expect(await kids.evaluate((element) => element.style.overflow)).toBe('hidden');

    await expect(kids).toHaveCount(0, { timeout: 6000 });

    await page.locator(toggleButton).click();
    await expect(kids).toHaveCount(1);
    expect(await animations(kids)).toBeGreaterThan(0);
    await expect.poll(() => height(kids), { timeout: 8000 }).toBe(full);
    await expect.poll(() => animations(kids), { timeout: 8000 }).toBe(0);
    expect(await kids.evaluate((element) => element.style.overflow)).toBe('');
  });

  test('a second click in the middle of the animation turns around from where it is', async ({
    page,
  }) => {
    await toggleWithKids(page);

    const kids = page.locator(toggleKids);
    const full = await height(kids);

    await page.locator(toggleButton).click();
    await expect.poll(() => height(kids), { timeout: 3000 }).toBeLessThan(full - 10);

    const middle = await height(kids);

    await page.locator(toggleButton).click();

    // Не прыжок к нулю или к полной высоте: сразу после разворота высота рядом с серединой.
    const after = await height(kids);

    expect(Math.abs(after - middle)).toBeLessThan(full / 3);

    await expect.poll(() => height(kids), { timeout: 8000 }).toBe(full);
    await expect(kids).toHaveCount(1);
    await expect(page.locator(toggleButton)).toHaveAttribute('aria-expanded', 'true');
  });

  test('the arrow turns smoothly', async ({ page }) => {
    await toggleWithKids(page);

    const transition = await page
      .locator(`${toggleButton} svg`)
      .evaluate((element) => getComputedStyle(element).transitionProperty);

    expect(transition).toContain('transform');
  });
});

test.describe('Collapse animation: list items and headings', () => {
  test('nested list items leave and come back with an animation', async ({ page }) => {
    await nestedList(page);

    const kids = page.locator(listKids);

    await page.locator(listFold).click();
    await expect(kids).toHaveCount(1);
    expect(await animations(kids)).toBeGreaterThan(0);
    await expect(kids).toHaveCount(0, { timeout: 6000 });

    await page.locator(listFold).click();
    await expect(kids).toHaveCount(1);
    expect(await animations(kids)).toBeGreaterThan(0);
    await expect.poll(() => animations(kids), { timeout: 8000 }).toBe(0);
  });

  test('the blocks of a folded section leave one by one in place, then the next heading stays', async ({
    page,
  }) => {
    await outline(page);

    const inside = page.locator(editable, { hasText: 'first inside' });
    const block = page.locator('[data-block-id]', { has: inside }).last();

    await heading(page, 'Fold me').hover();
    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();

    // Блоки раздела ещё на странице и анимируются, заголовок ниже едет вверх по мере того, как они сжимаются.
    await expect(inside).toHaveCount(1);
    expect(await animations(block)).toBeGreaterThan(0);
    await expect(inside).toHaveCount(0, { timeout: 6000 });
    await expect(heading(page, 'Stay visible')).toBeVisible();

    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();
    await expect(inside).toHaveCount(1);
    await expect
      .poll(() => animations(page.locator('[data-block-id]', { has: inside }).last()), {
        timeout: 8000,
      })
      .toBe(0);
    await expect(page.locator(editable, { hasText: 'second inside' })).toHaveCount(1);
  });

  /** Заголовок «Big» и под ним `count` строк — через движок песочницы (быстрее набора). Заголовок — у верха окна. */
  async function bigSection(page: Page, count: number) {
    await page.goto('/?lang=en');
    await page.addStyleTag({ content: SLOW });
    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+End`);
    await page.keyboard.press('Enter');
    await page.keyboard.type('# Big');
    await page.evaluate((count) => {
      type Block = {
        id: string;
        flavour: string;
        children: string[];
        content: { insert: string }[];
      };
      const { editor } = (
        window as never as {
          __inkbrick: {
            main: {
              editor: {
                document: { rootId: string; getBlock: (id: string) => Block };
                dispatch: (intent: unknown) => { blockId: string };
              };
            };
          };
        }
      ).__inkbrick.main;
      const note = editor.document.getBlock(
        editor.document.getBlock(editor.document.rootId).children[0],
      );
      let after = note.children[note.children.length - 1];

      for (let i = 0; i < count; i++) {
        after = editor.dispatch({
          type: 'insertBlock',
          payload: {
            flavour: 'block:paragraph',
            afterId: after,
            content: [{ insert: `line ${i}` }],
          },
        }).blockId;
      }
    }, count);
    await heading(page, 'Big').evaluate((node) => node.scrollIntoView({ block: 'start' }));
  }

  test('a long section animates the lines on the screen; lines far below go at once', async ({
    page,
  }) => {
    await bigSection(page, 60);
    await heading(page, 'Big').hover();
    await heading(page, 'Big').locator('[data-inkbrick-part="fold"]').click();

    // Строка у заголовка ещё уходит (3 с), а строка далеко ниже экрана исчезла сразу.
    await page.waitForTimeout(300);
    await expect(page.locator(editable, { hasText: /^line 0$/ })).toHaveCount(1);
    expect(
      await animations(
        page
          .locator(editable, { hasText: /^line 0$/ })
          .locator('xpath=ancestor::*[@data-block-id][1]'),
      ),
    ).toBeGreaterThan(0);
    await expect(page.locator(editable, { hasText: /^line 59$/ })).toHaveCount(0);

    await expect(page.locator(editable, { hasText: /^line 0$/ })).toHaveCount(0, { timeout: 5000 });
  });

  test('a section of hundreds of blocks animates only what is on the screen and folds whole', async ({
    page,
  }) => {
    await bigSection(page, 205);
    await heading(page, 'Big').hover();
    await heading(page, 'Big').locator('[data-inkbrick-part="fold"]').click();
    await page.waitForTimeout(300);

    // Одновременно движутся только строки у экрана, а не две сотни.
    const moving = await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target as Element | null;

          return !!target?.closest('[data-inkbrick-block="paragraph"]');
        }).length,
    );

    expect(moving).toBeGreaterThan(0);
    expect(moving).toBeLessThan(60);

    await expect(page.locator(editable, { hasText: /^line 0$/ })).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator(editable, { hasText: /^line 204$/ })).toHaveCount(0);
  });
});

test.describe('Collapse animation: off switches', () => {
  test('with prefers-reduced-motion and with the token at 0ms nothing waits', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toggleWithKids(page);

    await page.locator(toggleButton).click();
    expect(await page.locator(toggleKids).count()).toBe(0);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addStyleTag({ content: ':root { --inkbrick-collapse-duration: 0ms; }' });
    await page.locator(toggleButton).click();
    await expect(page.locator(toggleKids)).toHaveCount(1);
    await page.locator(toggleButton).click();
    expect(await page.locator(toggleKids).count()).toBe(0);
  });
});

test.describe('Collapse animation: virtual renderer (50 000 blocks)', () => {
  test('a section folds smoothly with no jump at the end, unfolds smoothly, and nothing throws', async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lang=en');
    await useTool(page, 'load-large');
    await expect(page.locator('.editable[data-id="large-0"]')).toBeVisible();

    // Высота строки зависит от шрифтов машины, поэтому к «large-100» подходим по факту, а не по фиксированному смещению.
    const target = page.locator('.editable[data-id="large-100"]');

    await expect(async () => {
      if ((await target.count()) === 0) {
        // Ближайший к середине окна блок (первый блок документа держится в дереве всегда, его брать нельзя).
        const delta = await page.evaluate(() => {
          const middle = window.innerHeight / 2;
          let best: { id: number; gap: number } | null = null;

          for (const node of document.querySelectorAll('.editable[data-id^="large-"]')) {
            const id = Number(node.getAttribute('data-id')!.replace('large-', ''));
            const rect = node.getBoundingClientRect();
            const gap = Math.abs(rect.top - middle);

            if (rect.bottom > 0 && rect.top < window.innerHeight && (!best || gap < best.gap)) {
              best = { id, gap };
            }
          }

          const perBlock = document.documentElement.scrollHeight / 50_000;

          return ((100 - (best ? best.id : 0)) * perBlock) | 0;
        });

        await page.evaluate((by) => window.scrollBy(0, by), delta || 400);
      }

      await expect(target).toHaveCount(1, { timeout: 500 });
    }).toPass({ timeout: 15_000 });
    await target.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await expect(target).toBeInViewport();

    const fold = page
      .locator('.editable[data-id="large-100"]')
      .locator('xpath=..')
      .locator('[data-inkbrick-part="fold"]');

    // Кадр за кадром: положение следующего заголовка и высота первого скрытого блока.
    const record = (frames: number) =>
      page.evaluate(
        (count) =>
          new Promise<{ top: number | null; height: number | null }[]>((resolve) => {
            const rows: { top: number | null; height: number | null }[] = [];
            const tick = () => {
              const next = document.querySelector('.editable[data-id="large-200"]');
              const first = document
                .querySelector('.editable[data-id="large-101"]')
                ?.closest('[data-block-id]');

              rows.push({
                top: next ? next.getBoundingClientRect().top : null,
                height: first ? first.getBoundingClientRect().height : null,
              });

              if (rows.length < count) requestAnimationFrame(tick);
              else resolve(rows);
            };

            requestAnimationFrame(tick);
          }),
        frames,
      );
    // Шаги следующего заголовка от кадра к кадру: без разворота и без рывка в самом конце (ослабление движения подходит к нулю).
    const shifts = (rows: { top: number | null }[]) => {
      const tops = rows.map((row) => row.top).filter((top): top is number => top !== null);

      return tops
        .slice(1)
        .map((top, i) => top - tops[i])
        .filter((step) => Math.abs(step) > 0.01);
    };

    const folding = record(40);

    await fold.click();

    const rows = await folding;
    const heights = rows.map((row) => row.height).filter((h): h is number => h !== null);

    // Блок на самом деле сжимается (а не остаётся на `min-height`), заголовок ниже едет только вверх и не разворачивается.
    expect(heights.length).toBeGreaterThan(0);

    const moves = shifts(rows);

    // Сколько кадров успеет записаться, зависит от браузера и нагрузки: проверяем только направление.
    expect(Math.max(0, ...moves)).toBeLessThan(5);

    await expect(page.locator('.editable[data-id="large-101"]')).toHaveCount(0);

    // Когда анимация закончилась, между свёрнутым заголовком и следующим нет пустого места.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const heading = document.querySelector('.editable[data-id="large-100"]')!;
          const next = document.querySelector('.editable[data-id="large-200"]');

          return next
            ? next.getBoundingClientRect().top - heading.getBoundingClientRect().bottom
            : 9999;
        }),
      )
      .toBeLessThan(60);

    const unfolding = record(40);

    await fold.click();

    const grown = (await unfolding).map((row) => row.height).filter((h): h is number => h !== null);

    expect(grown.length).toBeGreaterThan(3);
    expect(Math.min(...grown)).toBeLessThan(10);
    expect(Math.max(...grown)).toBeGreaterThan(20);
    await expect(page.locator('.editable[data-id="large-101"]')).toHaveCount(1);

    // Рывки скроллом посреди анимации не раскачивают список (раньше это могло закончиться бесконечным циклом обновлений).
    for (let i = 0; i < 3; i++) {
      await fold.click();
      for (const delta of [250, -400, 600, -200]) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(400);
    }

    expect(errors).toEqual([]);
  });
});
