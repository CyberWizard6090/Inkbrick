import { test, expect, type CDPSession, type Page } from '@playwright/test';

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'touch emulation via CDP is Chromium-only',
);

test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });

const editable = '.editable';
const handle = '[data-testid="block-handle"]';
const grip = `${handle} [data-action="grip"]`;
const menu = '[data-testid="block-menu"]';
const indicator = '[data-testid="drop-indicator"]';

const texts = (page: Page) => page.locator(editable).allTextContents();

async function typeBlocks(page: Page, values: string[]) {
  await page.locator(editable).first().tap();

  for (const [i, value] of values.entries()) {
    await page.keyboard.type(value);
    if (i < values.length - 1) await page.keyboard.press('Enter');
  }
}

async function showHandle(page: Page, index: number) {
  const text = (await page.locator(editable).nth(index).boundingBox())!;

  await page.touchscreen.tap(text.x + text.width - 4, text.y + text.height / 2);
  await expect(page.locator(handle)).toBeVisible();

  const blockId = await page
    .locator(editable)
    .nth(index)
    .evaluate((el) => el.closest('[data-block-id]')!.getAttribute('data-block-id'));

  await expect(page.locator(handle)).toHaveAttribute('data-block', blockId!);
}

const center = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

async function finger(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }],
    });

  let at = { x: 0, y: 0 };

  return {
    async down(x: number, y: number) {
      at = { x, y };
      await send('touchStart', x, y);
    },
    async move(x: number, y: number, steps = 8) {
      const from = at;
      for (let i = 1; i <= steps; i++) {
        await send(
          'touchMove',
          from.x + ((x - from.x) * i) / steps,
          from.y + ((y - from.y) * i) / steps,
        );
      }
      at = { x, y };
    },
    async up() {
      await send('touchEnd');
      await cdp.detach();
    },
  };
}

async function touchDrag(
  page: Page,
  from: number,
  to: number,
  half: 'top' | 'bottom',
  release = true,
) {
  await showHandle(page, from);

  const start = await center(page, grip);
  const touch = await finger(page);

  await touch.down(start.x, start.y);
  await page.waitForTimeout(500); // долгое нажатие
  await expect(page.locator(`[data-block-id][data-inkbrick-dragging="true"]`)).toHaveCount(1);

  const target = (await page.locator(editable).nth(to).boundingBox())!;

  await touch.move(target.x + 30, half === 'top' ? target.y + 3 : target.y + target.height - 3);

  if (release) await touch.up();

  return touch;
}

test.describe('Touch drag and drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['one', 'two', 'three', 'four']);
  });

  test('tapping a block shows its handle', async ({ page }) => {
    await showHandle(page, 2);
    await showHandle(page, 0);
  });

  test('a long press on the grip picks the block up and the finger moves it', async ({ page }) => {
    const touch = await touchDrag(page, 0, 2, 'bottom', false);

    await expect(page.locator(indicator)).toBeVisible();
    await expect(page.locator(indicator)).toHaveAttribute('data-position', 'after');

    await touch.up();

    expect(await texts(page)).toEqual(['two', 'three', 'one', 'four']);
    await expect(page.locator(indicator)).toHaveCount(0);
    await expect(page.locator('[data-inkbrick-dragging="true"]')).toHaveCount(0);
  });

  test('drops above a block when released over its upper half', async ({ page }) => {
    await touchDrag(page, 3, 1, 'top');

    expect(await texts(page)).toEqual(['one', 'four', 'two', 'three']);
  });

  test('the page does not scroll while a block is dragged', async ({ page }) => {
    const before = await page.evaluate(() => window.scrollY);
    const touch = await touchDrag(page, 0, 1, 'bottom', false);

    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await touch.up();
    expect(await texts(page)).toEqual(['two', 'one', 'three', 'four']);
  });

  test('a short tap on the grip opens the block menu', async ({ page }) => {
    await showHandle(page, 1);

    const at = await center(page, grip);
    await page.touchscreen.tap(at.x, at.y);

    await expect(page.locator(menu)).toBeVisible();
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);
  });

  test('a swipe on the grip without a long press does not move the block', async ({ page }) => {
    await showHandle(page, 0);

    const start = await center(page, grip);
    const target = (await page.locator(editable).nth(2).boundingBox())!;
    const touch = await finger(page);

    await touch.down(start.x, start.y);
    await touch.move(target.x + 30, target.y + target.height - 3, 4);
    await page.waitForTimeout(500);
    await touch.up();

    await expect(page.locator(indicator)).toHaveCount(0);
    await expect(page.locator(menu)).toHaveCount(0);
    expect(await texts(page)).toEqual(['one', 'two', 'three', 'four']);
  });
});
