import { test, expect, type Page } from '@playwright/test';

/** `editor.selection` движка и выделение на экране связаны в обе стороны. */

const selection = (page: Page) =>
  page.evaluate(() => window.__inkbrick!.main.editor.selection.get());

const firstId = (page: Page) =>
  page.locator('.editable').first().getAttribute('data-id') as Promise<string>;

test('what the user selects lands in editor.selection, with its direction', async ({ page }) => {
  await page.goto('/?lang=en');

  const editable = page.locator('.editable').first();

  await editable.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' selected');

  const id = await firstId(page);
  const length = await editable.evaluate((node) => node.textContent!.length);

  await expect
    .poll(() => selection(page))
    .toEqual({
      type: 'text',
      anchor: { blockId: id, offset: length },
      focus: { blockId: id, offset: length },
    });

  // Shift+Home тянет подвижный край назад: anchor остаётся в конце.
  await page.keyboard.press('Shift+Home');
  await expect
    .poll(() => selection(page))
    .toEqual({
      type: 'text',
      anchor: { blockId: id, offset: length },
      focus: { blockId: id, offset: 0 },
    });

  // Esc выбирает блок целиком.
  await page.keyboard.press('Escape');
  await expect.poll(() => selection(page)).toEqual({ type: 'blocks', ids: [id] });
});

test('a selection set by code appears on screen: text, blocks', async ({ page }) => {
  await page.goto('/?lang=en');

  const editable = page.locator('.editable').first();

  await editable.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' alpha beta');

  const id = await firstId(page);
  const text = (await editable.textContent())!;
  const start = text.indexOf('alpha');

  await page.evaluate(
    ([blockId, from]) =>
      window.__inkbrick!.main.editor.selection.select(
        { blockId, offset: from },
        { blockId, offset: from + 5 },
      ),
    [id, start] as const,
  );
  await expect.poll(() => page.evaluate(() => getSelection()!.toString())).toBe('alpha');

  await page.evaluate(
    (blockId) => window.__inkbrick!.main.editor.selection.selectBlocks([blockId]),
    id,
  );
  await expect(page.locator(`[data-block-id="${id}"][data-picked]`)).toHaveCount(1);

  // Код снимает выделение — снимается и на экране.
  await page.evaluate(() => window.__inkbrick!.main.editor.selection.clear());
  await expect(page.locator('[data-picked]')).toHaveCount(0);
});
