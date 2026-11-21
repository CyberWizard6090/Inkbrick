import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const handle = '[data-testid="block-handle"]';
const indicator = '[data-testid="drop-indicator"]';
const columns = '[data-inkbrick-block="columns"]';
const column = '[data-inkbrick-block="column"]';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

/** Тянет блок `from` за ручку и ведёт указатель к краю блока `to`; без `release` линия остаётся на экране. */
async function dragToEdge(
  page: Page,
  from: number,
  to: number,
  edge: 'left' | 'right',
  release = true,
) {
  await page.locator(editable).nth(from).hover();
  await expect(page.locator(handle)).toBeVisible();

  const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
  const target = (await page.locator(editable).nth(to).boundingBox())!;

  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 40, grip.y + grip.height / 2 + 12, { steps: 3 });
  await page.mouse.move(
    edge === 'left' ? target.x + 6 : target.x + target.width - 6,
    target.y + target.height / 2,
    { steps: 6 },
  );

  if (release) await page.mouse.up();
}

test.describe('Columns by dragging a block to the edge of another', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['one', 'two', 'three']);
  });

  test('a vertical line shows at the edge; the drop makes two columns; one undo restores', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right', false);

    const line = page.locator(indicator);

    await expect(line).toHaveAttribute('data-side', 'right');
    expect((await line.boundingBox())!.height).toBeGreaterThan(10);

    await page.mouse.up();

    await expect(page.locator(columns)).toHaveCount(1);
    await expect(page.locator(`${columns} ${column}`)).toHaveCount(2);
    await expect(page.locator(`${column}:nth-child(1) ${editable}`)).toHaveText('one');
    await expect(page.locator(`${column}:nth-child(2) ${editable}`)).toHaveText('three');
    await expect(page.locator(editable)).toHaveText(['one', 'three', 'two']);

    await page.keyboard.press(`${modifier}+z`);

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);
  });

  test('the left edge puts the dragged block first', async ({ page }) => {
    await dragToEdge(page, 2, 0, 'left');

    await expect(page.locator(`${column}:nth-child(1) ${editable}`)).toHaveText('three');
    await expect(page.locator(`${column}:nth-child(2) ${editable}`)).toHaveText('one');
  });

  test('dropping at the middle of a block still moves it before or after as usual', async ({
    page,
  }) => {
    await page.locator(editable).nth(2).hover();

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const target = (await page.locator(editable).nth(0).boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 40, grip.y + grip.height / 2 - 12, { steps: 3 });
    await page.mouse.move(target.x + target.width / 2, target.y + 3, { steps: 6 });
    await page.mouse.up();

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['three', 'one', 'two']);
  });

  test('a block dragged out of a column leaves, and the emptied column is removed', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right');
    // Теперь «one | three», затем «two»: тянем «three» к правому краю «two» — колонки разворачиваются.
    await dragToEdge(page, 1, 2, 'right');

    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);
    await expect(page.locator(`${columns} ${column}`)).toHaveCount(2);
    await expect(page.locator(`${columns} ${editable}`)).toHaveText(['two', 'three']);
  });

  test('the handle of the second column stays reachable across the gap and the divider', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right');

    const text = (await page.locator(`${column}:nth-child(2) ${editable}`).boundingBox())!;

    await page.locator(`${column}:nth-child(2) ${editable}`).hover();
    await expect(page.locator(handle)).toBeVisible();

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const y = grip.y + grip.height / 2;

    // Указатель идёт от текста к ручке через промежуток с разделителем: ручка остаётся у второй колонки.
    for (let x = text.x; x >= grip.x + grip.width / 2; x -= 4) await page.mouse.move(x, y);

    expect((await page.locator(handle).boundingBox())!.x).toBeGreaterThan(
      (await page.locator(`${column}:nth-child(1) ${editable}`).boundingBox())!.x +
        (await page.locator(`${column}:nth-child(1) ${editable}`).boundingBox())!.width -
        40,
    );

    await page.mouse.down();
    await page.mouse.move(grip.x + 30, y + 80, { steps: 4 });
    await page.mouse.up();

    // Ручка схватилась: перенос начался, а не потянулся разделитель колонок.
    await expect(page.locator(columns)).toHaveCount(1);
  });

  test('a block moved out of a column by an ordinary drop does not leave an empty column', async ({
    page,
  }) => {
    await dragToEdge(page, 2, 0, 'right');
    await page.locator(`${column}:nth-child(2) ${editable}`).hover();

    const grip = (await page.locator(`${handle} [data-action="grip"]`).boundingBox())!;
    const target = (await page.locator(editable).nth(2)).first();
    const box = (await target.boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 20, grip.y + 40, { steps: 3 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3, { steps: 6 });
    await page.mouse.up();

    await expect(page.locator(columns)).toHaveCount(0);
    await expect(page.locator(editable)).toHaveText(['one', 'two', 'three']);
  });
});
