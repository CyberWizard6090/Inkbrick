import AxeBuilder from '@axe-core/playwright';
import { deflateSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const crop = '[data-testid="image-crop"]';
const frame = '[data-inkbrick-part="crop-frame"]';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;

  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;

  return c >>> 0;
});

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = 0xffffffff;

  for (const byte of body) crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  const out = Buffer.alloc(8 + data.length + 4);

  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);

  return out;
}

/** PNG `width` × `height` с градиентом: пропорции нужны кадрированию, поэтому берём не квадрат. */
function makePng(width: number, height: number): Buffer {
  const rows = Buffer.alloc((width * 3 + 1) * height);

  for (let y = 0; y < height; y++) {
    const start = y * (width * 3 + 1);

    for (let x = 0; x < width; x++) {
      rows[start + 1 + x * 3] = Math.round((255 * x) / width);
      rows[start + 2 + x * 3] = Math.round((255 * y) / height);
      rows[start + 3 + x * 3] = 160;
    }
  }

  const header = Buffer.alloc(13);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const wide = { name: 'wide.png', mimeType: 'image/png', buffer: makePng(400, 200) };

async function addImage(page: Page) {
  await page.goto('/?lang=en');
  await page.locator(editable).first().click();
  await page.keyboard.type('/image');
  await page.keyboard.press('Enter');
  await page.getByTestId('image-file').setInputFiles(wide);
  await expect(page.locator(crop)).toBeVisible();
  // Картинка загружена: пропорции самой картинки известны, раскладка кадра установилась.
  await expect
    .poll(() => page.locator(`${frame} img`).evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(400);
}

const imageProps = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window.__inkbrick!.main;
    const stack = [editor.document.rootId];

    while (stack.length > 0) {
      const block = editor.document.getBlock(stack.pop()!)!;

      if (block.flavour === 'block:image') {
        const { aspect, zoom, cropX, cropY } = block.props;

        return { aspect, zoom, cropX, cropY };
      }

      stack.push(...block.children);
    }

    return null;
  });

test.describe('Image crop', () => {
  test('the frame opens by itself after a file is added, and shows the whole image', async ({
    page,
  }) => {
    await addImage(page);

    await expect(
      page.locator('[data-inkbrick-part="crop-aspect"][data-aspect="auto"]'),
    ).toHaveAttribute('aria-checked', 'true');
    expect(await imageProps(page)).toMatchObject({ aspect: 'auto', zoom: 1, cropX: 50, cropY: 50 });
  });

  test('ratio, drag and zoom are written together and one undo takes them back', async ({
    page,
  }) => {
    await addImage(page);

    await page.locator('[data-inkbrick-part="crop-aspect"][data-aspect="1:1"]').click();

    const box = (await page.locator(frame).boundingBox())!;

    expect(Math.abs(box.width - box.height)).toBeLessThan(2);

    // Картинка 2:1 в квадрате шире кадра: если потянуть влево, покажется её правая часть.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    await page.locator('[data-inkbrick-part="crop-zoom"] input').fill('2');
    await page.locator('[data-inkbrick-part="crop-done"]').click();

    await expect(page.locator(crop)).toBeHidden();

    const saved = (await imageProps(page))!;

    expect(saved.aspect).toBe('1:1');
    expect(saved.zoom).toBe(2);
    expect(saved.cropX as number).toBeGreaterThan(50);
    expect(saved.cropY).toBe(50);

    await page.evaluate(() => window.__inkbrick!.main.editor.undo());

    expect(await imageProps(page)).toMatchObject({ aspect: 'auto', zoom: 1, cropX: 50 });
  });

  test('the saved crop is drawn: the frame has the ratio, the image covers it and is moved', async ({
    page,
  }) => {
    await addImage(page);
    await page.locator('[data-inkbrick-part="crop-aspect"][data-aspect="1:1"]').click();
    await page.locator('[data-inkbrick-part="crop-done"]').click();

    const view = page.locator('[data-inkbrick-part="figure"] [data-inkbrick-part="frame"]');

    await expect(view).toBeVisible();

    const box = (await view.boundingBox())!;

    expect(Math.abs(box.width - box.height)).toBeLessThan(2);

    // Картинка 2:1 в квадрате: вдвое шире кадра и по высоте точно по кадру.
    const image = await view.locator('img').evaluate((img: HTMLImageElement) => ({
      width: img.getBoundingClientRect().width,
      height: img.getBoundingClientRect().height,
    }));

    expect(Math.abs(image.width - box.width * 2)).toBeLessThan(3);
    expect(Math.abs(image.height - box.height)).toBeLessThan(2);
  });

  test('Escape drops the draft; the button on the image tools opens the frame again; reset', async ({
    page,
  }) => {
    await addImage(page);
    await page.locator('[data-inkbrick-part="crop-aspect"][data-aspect="16:9"]').click();
    await page.locator(frame).focus();
    await page.keyboard.press('Escape');

    await expect(page.locator(crop)).toBeHidden();
    expect(await imageProps(page)).toMatchObject({ aspect: 'auto' });

    await page.locator('[data-inkbrick-part="figure"]').hover();
    await page.getByRole('button', { name: 'Crop image' }).click();
    await expect(page.locator(crop)).toBeVisible();

    await page.locator('[data-inkbrick-part="crop-aspect"][data-aspect="3:4"]').click();
    await page.locator('[data-inkbrick-part="crop-reset"]').click();
    await expect(
      page.locator('[data-inkbrick-part="crop-aspect"][data-aspect="auto"]'),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('the keyboard moves the frame, zooms it and finishes', async ({ page }) => {
    await addImage(page);
    await page.locator('[data-inkbrick-part="crop-aspect"][data-aspect="1:1"]').click();
    await page.locator(frame).focus();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.keyboard.press('Enter');

    await expect(page.locator(crop)).toBeHidden();

    const saved = (await imageProps(page))!;

    expect(saved.cropX).toBe(54);
    expect(saved.zoom).toBeCloseTo(1.2, 5);
  });

  test('the frame and its controls pass the accessibility check', async ({ page }) => {
    await addImage(page);

    const result = await new AxeBuilder({ page }).include(crop).analyze();

    expect(
      result.violations
        .filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
        .map(
          (violation) =>
            violation.id + ' ' + violation.nodes.map((n) => n.html.slice(0, 90)).join(' / '),
        ),
    ).toEqual([]);
  });
});

test.describe('Image crop on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');

  test('the frame fits the screen, the buttons are big enough for a finger, and a tap opens the tools', async ({
    page,
  }) => {
    await addImage(page);

    const inside = await page.locator(crop).evaluate((node) => {
      const box = node.getBoundingClientRect();

      return box.left >= 0 && box.right <= window.innerWidth;
    });

    expect(inside).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );

    for (const selector of [
      '[data-inkbrick-part="crop-done"]',
      '[data-inkbrick-part="crop-cancel"]',
      '[data-inkbrick-part="crop-aspect"][data-aspect="16:9"]',
    ]) {
      expect((await page.locator(selector).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await page.locator('[data-inkbrick-part="crop-done"]').tap();
    await expect(page.locator(crop)).toBeHidden();

    // На сенсорном экране нет наведения: касание картинки показывает панель инструментов.
    await page.locator('[data-inkbrick-part="figure"]').tap();
    await expect(page.locator('[data-inkbrick-part="tools"]')).toBeVisible();
  });
});
