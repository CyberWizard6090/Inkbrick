import AxeBuilder from '@axe-core/playwright';
import { deflateSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const cropper = '[data-testid="image-cropper"]';
const box = '[data-inkbrick-part="cropper-box"]';

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

/** Документ с одной картинкой 400×200 из файла: окно обрезки открывается само, картинка в нём загружена. */
async function addImage(page: Page) {
  await page.goto('/?lang=en');
  await page.locator(editable).first().click();
  await page.keyboard.type('/image');
  await page.keyboard.press('Enter');
  await page.getByTestId('image-file').setInputFiles(wide);
  await expect(page.locator(cropper)).toBeVisible();
  await expect(page.locator('[data-inkbrick-part="cropper-canvas"][data-ready]')).toBeVisible();
}

const imageProps = (page: Page) =>
  page.evaluate(() => {
    const { editor } = window.__inkbrick!.main;
    const stack = [editor.document.rootId];

    while (stack.length > 0) {
      const block = editor.document.getBlock(stack.pop()!)!;

      if (block.flavour === 'block:image') return block.props as Record<string, unknown>;

      stack.push(...block.children);
    }

    return null;
  });

/** Размер картинки, которую показывает блок (файл обрезки), в пикселях. */
const shownSize = (page: Page) =>
  page.locator('[data-inkbrick-part="figure"] img').evaluate(async (img: HTMLImageElement) => {
    await img.decode().catch(() => undefined);

    return [img.naturalWidth, img.naturalHeight];
  });

async function drag(page: Page, selector: string, dx: number, dy: number) {
  const handle = (await page.locator(selector).boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

test.describe('Image crop', () => {
  test('the full-screen window opens after a file is added: the whole image, freeform, Cancel keeps it', async ({
    page,
  }) => {
    await addImage(page);

    const view = page.viewportSize()!;
    const dialog = (await page.locator(cropper).boundingBox())!;

    expect(dialog).toMatchObject({ x: 0, y: 0, width: view.width, height: view.height });
    await expect(page.getByRole('dialog', { name: 'Crop image' })).toBeVisible();
    await expect(page.locator(box)).toBeFocused();

    const frame = (await page.locator(box).boundingBox())!;
    const canvas = (await page.locator('[data-inkbrick-part="cropper-canvas"]').boundingBox())!;

    expect(Math.abs(frame.width - canvas.width)).toBeLessThan(2);
    expect(Math.abs(canvas.width / canvas.height - 2)).toBeLessThan(0.02);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator(cropper)).toHaveCount(0);
    expect(await imageProps(page)).toMatchObject({
      aspect: 'free',
      cropWidth: 100,
      originalSrc: '',
    });
  });

  test('dragging the edges crops the image into a new file; the original is kept; one undo', async ({
    page,
  }) => {
    await addImage(page);

    const frame = (await page.locator(box).boundingBox())!;

    // Правый край — к середине: остаётся левая половина картинки.
    await drag(page, '[data-handle="e"]', -frame.width / 2, 0);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator(cropper)).toHaveCount(0);

    const saved = (await imageProps(page))!;

    expect(saved.aspect).toBe('free');
    expect(saved.cropX).toBe(0);
    expect(Math.abs((saved.cropWidth as number) - 50)).toBeLessThan(1);
    expect(String(saved.originalSrc)).toMatch(/^data:image\/png;base64,/);
    expect(saved.src).not.toBe(saved.originalSrc);

    const [width, height] = await shownSize(page);

    expect(Math.abs(width - 200)).toBeLessThanOrEqual(2);
    expect(height).toBe(200);

    await page.evaluate(() => window.__inkbrick!.main.editor.undo());
    expect(await imageProps(page)).toMatchObject({ originalSrc: '', cropWidth: 100 });
  });

  test('the shape menu: a circle makes a round file; a ratio in portrait or landscape keeps its proportions', async ({
    page,
  }) => {
    await addImage(page);

    await page.getByRole('button', { name: 'Shape' }).click();
    await expect(page.getByRole('menu', { name: 'Shape' })).toBeVisible();
    await page.getByRole('menuitemradio', { name: 'Circle' }).click();

    const round = (await page.locator(box).boundingBox())!;

    expect(Math.abs(round.width - round.height)).toBeLessThan(2);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator(cropper)).toHaveCount(0);

    expect(await imageProps(page)).toMatchObject({ aspect: 'circle', cropWidth: 50 });
    // Круг — WebP с прозрачностью (в браузере без WebP — PNG): у фотографии так файл в разы меньше.
    expect(String((await imageProps(page))!.src)).toMatch(/^data:image\/(webp|png);base64,/);
    await expect(page.locator('[data-inkbrick-part="figure"]')).toHaveAttribute(
      'data-shape',
      'circle',
    );
    expect(await shownSize(page)).toEqual([200, 200]);

    // Угол файла круга прозрачный, середина — нет.
    const alpha = await page
      .locator('[data-inkbrick-part="figure"] img')
      .evaluate((img: HTMLImageElement) => {
        const canvas = document.createElement('canvas');

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const context = canvas.getContext('2d')!;

        context.drawImage(img, 0, 0);

        return [
          context.getImageData(1, 1, 1, 1).data[3],
          context.getImageData(100, 100, 1, 1).data[3],
        ];
      });

    expect(alpha).toEqual([0, 255]);

    // Повторная обрезка идёт от оригинала: книжная 3:4.
    await page.locator('[data-inkbrick-part="figure"]').hover();
    await page.getByRole('button', { name: 'Crop image' }).click();
    await expect(page.locator('[data-inkbrick-part="cropper-canvas"][data-ready]')).toBeVisible();
    await page.getByRole('button', { name: 'Shape' }).click();
    await page.getByRole('menuitemradio', { name: '4:3 Portrait' }).click();

    const portrait = (await page.locator(box).boundingBox())!;

    expect(Math.abs(portrait.width / portrait.height - 0.75)).toBeLessThan(0.02);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator(cropper)).toHaveCount(0);

    expect(await imageProps(page)).toMatchObject({ aspect: '3:4', cropHeight: 100 });

    const [width, height] = await shownSize(page);

    expect(Math.abs(width / height - 0.75)).toBeLessThan(0.02);
    expect(height).toBe(200);
  });

  test('a circle without a crop file (a server without CORS) is still drawn round', async ({
    page,
  }) => {
    await addImage(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    // Как после неудачной загрузки файла обрезки: оригинал и рамка, обрезка — стилем.
    await page.evaluate(() => {
      const { editor } = window.__inkbrick!.main;
      const stack = [editor.document.rootId];

      while (stack.length > 0) {
        const block = editor.document.getBlock(stack.pop()!)!;

        if (block.flavour === 'block:image') {
          editor.dispatch({
            type: 'setBlockProps',
            payload: {
              blockId: block.id,
              props: { aspect: 'circle', cropX: 25, cropY: 0, cropWidth: 50, cropHeight: 100 },
            },
          });
        }

        stack.push(...block.children);
      }
    });

    const frame = page.locator(
      '[data-inkbrick-part="figure"] [data-inkbrick-part="frame"][data-ready]',
    );

    await expect(frame).toBeVisible();
    expect(await frame.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('50%');

    const box = (await frame.boundingBox())!;

    expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  });

  test('the keyboard moves and resizes the frame; Escape cancels, Enter saves', async ({
    page,
  }) => {
    await addImage(page);

    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.locator(cropper)).toHaveCount(0);
    expect(await imageProps(page)).toMatchObject({ cropWidth: 100 });

    await page.locator('[data-inkbrick-part="figure"]').hover();
    await page.getByRole('button', { name: 'Crop image' }).click();
    await expect(page.locator(box)).toBeFocused();
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator(cropper)).toHaveCount(0);

    expect(await imageProps(page)).toMatchObject({ cropX: 1, cropWidth: 98, cropHeight: 100 });
  });

  test('the side handles of the image change its width with the mouse, in one step', async ({
    page,
  }) => {
    await addImage(page);
    await page.getByRole('button', { name: 'Cancel' }).click();

    const figure = page.locator('[data-inkbrick-part="figure"]');
    const block = (await page.locator('[data-inkbrick-block="image"]').boundingBox())!;

    await figure.hover();
    await expect(page.locator('[data-inkbrick-part="resize"][data-side="end"]')).toBeVisible();
    // По центру ширина меняется с двух сторон: правый край на четверть блока влево — половина ширины.
    await drag(page, '[data-inkbrick-part="resize"][data-side="end"]', -block.width / 4, 0);

    const width = (await imageProps(page))!.width as number;

    expect(Math.abs(width - 50)).toBeLessThan(1.5);
    expect(await figure.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBeCloseTo(
      Math.round((block.width * width) / 100),
      -1,
    );

    await page.evaluate(() => window.__inkbrick!.main.editor.undo());
    expect((await imageProps(page))!.width).toBe(100);
  });

  test('the viewer shows the picture full screen, zooms, walks to the next one and closes', async ({
    page,
  }) => {
    await addImage(page);
    await page.getByRole('button', { name: 'Save' }).click();
    // Вторая картинка ниже: «вперёд» в просмотре.
    await page.evaluate(() => {
      const { editor } = window.__inkbrick!.main;
      const note = editor.document.getBlock(editor.document.rootId)!.children[0];
      const last = editor.document.getBlock(note)!.children.at(-1)!;
      const src = (document.querySelector('[data-inkbrick-part="figure"] img') as HTMLImageElement)
        .src;

      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:image', afterId: last, props: { src, alt: 'second' } },
      });
    });

    await page.locator('[data-inkbrick-part="figure"]').first().hover();
    await page.getByRole('button', { name: 'View full size' }).first().click();

    const viewer = page.getByRole('dialog', { name: 'Image viewer' });

    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('button', { name: /Fit to screen \(100%\)/ })).toBeVisible();
    await viewer.getByRole('button', { name: 'Zoom in' }).click();
    await expect(viewer.getByRole('button', { name: /150%/ })).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('img')).toHaveAttribute('alt', 'second');
    await expect(viewer.getByRole('button', { name: /100%/ })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Next image' })).toBeDisabled();

    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(viewer).toHaveCount(0);

    await page.locator('[data-inkbrick-part="figure"]').first().hover();
    await page.getByRole('button', { name: 'View full size' }).first().click();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('Download saves the shown (cropped) file; More offers the original', async ({ page }) => {
    await addImage(page);
    await drag(page, '[data-handle="e"]', -100, 0);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator(cropper)).toHaveCount(0);

    await page.locator('[data-inkbrick-part="figure"]').hover();

    const [shown] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download', exact: true }).click(),
    ]);

    expect(shown.suggestedFilename()).toMatch(/\.png$/);

    await page.getByRole('button', { name: 'More' }).click();

    const [original] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download original' }).click(),
    ]);

    expect(original.suggestedFilename()).toMatch(/\.png$/);
  });

  test('the crop window and the image tools pass the accessibility check', async ({ page }) => {
    await addImage(page);

    const serious = async (selector: string) =>
      (await new AxeBuilder({ page }).include(selector).analyze()).violations
        .filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
        .map(
          (violation) =>
            violation.id + ' ' + violation.nodes.map((n) => n.html.slice(0, 90)).join(' / '),
        );

    await page.getByRole('button', { name: 'Shape' }).click();
    expect(await serious(cropper)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await page.locator('[data-inkbrick-part="figure"]').hover();
    await page.getByRole('button', { name: 'More' }).click();
    expect(await serious('[data-inkbrick-block="image"]')).toEqual([]);
  });
});

test.describe('Image picker', () => {
  test('the file field lies over the Upload button, and selecting the button text does not open the text toolbar', async ({
    page,
  }) => {
    await page.goto('/?formatting=toolbar&lang=en');
    await page.locator(editable).first().click();
    await page.keyboard.type('/image');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('image-picker')).toBeVisible();

    // Поле файла лежит прозрачным поверх кнопки (иначе во встроенных браузерах телефонов выбор файла не открывается).
    const covered = await page.evaluate(() => {
      const label = document.querySelector('[data-inkbrick-part="picker-upload"]')!;
      const input = label.querySelector('input[type="file"]')!;
      const a = label.getBoundingClientRect();
      const b = input.getBoundingClientRect();

      return (
        Math.abs(a.width - b.width) < 1 &&
        Math.abs(a.height - b.height) < 1 &&
        getComputedStyle(input).opacity === '0'
      );
    });

    expect(covered).toBe(true);

    // Выделение текста кнопки (долгое нажатие на телефоне) не показывает панель форматирования.
    await page.evaluate(() => {
      const label = document.querySelector('[data-inkbrick-part="picker-upload"]')!;
      const range = document.createRange();

      range.selectNodeContents(label);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="toolbar"]')).toHaveCount(0);
  });
});

test.describe('Image crop on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');

  test('the window takes the whole screen, the buttons are big enough for a finger, and a tap opens the tools', async ({
    page,
  }) => {
    await addImage(page);

    const dialog = (await page.locator('[data-inkbrick-part="cropper-panel"]').boundingBox())!;

    expect(dialog).toMatchObject({ x: 0, y: 0, width: 375, height: 740 });

    for (const name of ['Save', 'Cancel', 'Shape']) {
      expect(
        (await page.getByRole('button', { name }).boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }

    // Рамку тянут пальцем.
    const handle = (await page.locator('[data-handle="e"]').boundingBox())!;

    await page.touchscreen.tap(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.getByRole('button', { name: 'Save' }).tap();
    await expect(page.locator(cropper)).toHaveCount(0);

    // На сенсорном экране нет наведения: касание картинки показывает панель инструментов и ручки ширины.
    await page.locator('[data-inkbrick-part="figure"]').tap();
    await expect(page.locator('[data-inkbrick-part="tools"]')).toBeVisible();
    await expect(page.locator('[data-inkbrick-part="resize"]').first()).toBeVisible();
  });
});
