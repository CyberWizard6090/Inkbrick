import { test, expect } from '@playwright/test';

/** Песочница: ручка слева от редактора меняет его ширину, ширина запоминается. */

const editorBox = (page: import('@playwright/test').Page) =>
  page.locator('.playground-editor').evaluate((node) => node.getBoundingClientRect().width);

test('the handle on the left resizes the editor, the width survives a reload, double-click resets it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?lang=en');

  const handle = page.getByRole('separator', { name: 'Editor width' });

  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('aria-valuenow', '816');

  // Снаружи область шире на свои поля: сверяем приращения.
  const initial = await editorBox(page);

  const box = (await handle.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 5 });
  await expect(page.locator('.editor-width-handle__value')).toHaveText('1016 px');
  await page.mouse.up();

  // Редактор стоит по центру: левый край сдвинут на 100 px — ширина больше на 200.
  expect(await editorBox(page)).toBe(initial + 200);
  await expect(handle).toHaveAttribute('aria-valuenow', '1016');

  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', '1016');
  expect(await editorBox(page)).toBe(initial + 200);

  // Клавиатура: стрелка влево шире, вправо уже.
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '1000');

  await handle.dblclick();
  await expect(handle).toHaveAttribute('aria-valuenow', '816');
  expect(await editorBox(page)).toBe(initial);
});

test('the width handle does not cover the block handles in the gutter', async ({ page }) => {
  await page.goto('/?lang=en');

  const grip = page.locator('[data-testid="block-handle"] [data-action="grip"]');

  // Ручка блока — ленивый чанк: наведение до его загрузки ничего не показывает, наводим снова.
  await expect(async () => {
    await page.mouse.move(0, 0);
    await page.locator('.editable').first().hover();
    await expect(grip).toBeVisible({ timeout: 1000 });
  }).toPass();

  const handle = (await page.getByRole('separator', { name: 'Editor width' }).boundingBox())!;
  const gripBox = (await grip.boundingBox())!;

  expect(handle.x + handle.width).toBeLessThanOrEqual(gripBox.x);
});
