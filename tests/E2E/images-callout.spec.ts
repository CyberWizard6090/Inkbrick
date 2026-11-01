import { test, expect, type Page } from '@playwright/test';

import { useSystemClipboard } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const png = (name = 'pic.png') => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(PNG_BASE64, 'base64'),
});

interface Row {
  flavour: string;
  text: string;
  props: Record<string, any>;
}

const doc = (page: Page) =>
  page.evaluate(() => {
    const snap = (window as any).__inkbrick.main.snapshot();
    const rows: Row[] = [];
    const walk = (id: string) => {
      const block = snap.blocks[id];
      if (block.flavour !== 'block:page' && block.flavour !== 'block:note') {
        rows.push({
          flavour: block.flavour.replace('block:', ''),
          text: block.content.map((c: any) => c.insert).join(''),
          props: block.props,
        });
      }
      block.children.forEach(walk);
    };
    walk(snap.rootId);
    return rows;
  });

const kinds = async (page: Page) => (await doc(page)).map((r) => r.flavour);

async function paste(
  page: Page,
  data: {
    html?: string;
    text?: string;
    files?: Array<{ name: string; type: string; base64: string }>;
  },
) {
  await page.evaluate((payload) => {
    const dt = new DataTransfer();

    if (payload.html !== undefined) dt.setData('text/html', payload.html);
    if (payload.text !== undefined) dt.setData('text/plain', payload.text);
    for (const f of payload.files ?? []) {
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    }

    const root = document.querySelector('.inkbrick-editor') as HTMLElement;
    root.focus();
    root.dispatchEvent(
      Object.defineProperty(
        new Event('paste', { bubbles: true, cancelable: true }),
        'clipboardData',
        { value: dt },
      ),
    );
  }, data);
}

const pngFile = (name = 'shot.png') => ({ name, type: 'image/png', base64: PNG_BASE64 });

async function insertImageBlock(page: Page) {
  await page.locator(editable).first().click();
  await page.keyboard.type('/image');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('image-picker')).toBeVisible();
}

test.describe('Callout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('slash menu creates a callout; the icon cycles the tone', async ({ page }) => {
    await page.keyboard.type('/callout');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Careful');

    const callout = page.locator('.block-callout');
    await expect(callout).toHaveAttribute('data-tone', 'info');
    await expect(callout.locator('.editable')).toHaveText('Careful');

    for (const tone of ['warning', 'success', 'danger', 'info']) {
      await callout.locator('.callout-icon').click();
      await expect(callout).toHaveAttribute('data-tone', tone);
    }

    await callout.locator('.editable').click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(callout.locator('.editable')).toHaveText('Careful!');
  });

  test('Enter continues the callout with the same tone; Enter on an empty one leaves it', async ({
    page,
  }) => {
    await page.keyboard.type('/callout');
    await page.keyboard.press('Enter');
    await page.locator('.callout-icon').click(); // warning
    await page.locator('.block-callout .editable').click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');

    await expect(page.locator('.block-callout[data-tone="warning"]')).toHaveCount(2);

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect(await kinds(page)).toEqual(['callout', 'callout', 'paragraph']);
  });

  test('copy puts <aside data-callout> in the HTML; pasting it back (or from elsewhere) makes a callout', async ({
    page,
    context,
  }) => {
    await useSystemClipboard(context);
    await page.keyboard.type('/callout');
    await page.keyboard.press('Enter');
    await page.locator('.callout-icon').click();
    await page.locator('.block-callout .editable').click();
    await page.keyboard.type('Heads up');
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+C`);

    const html = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return await (await item.getType('text/html')).text();
    });
    expect(html).toContain('<aside data-callout="warning">Heads up</aside>');

    await paste(page, {
      html: '<aside data-callout="danger">Stop</aside><aside data-callout="bogus">Odd</aside>',
    });
    const rows = await doc(page);

    expect(rows.slice(-2).map((r) => [r.flavour, r.text, r.props.tone])).toEqual([
      ['callout', 'Stop', 'danger'],
      ['callout', 'Odd', 'info'],
    ]);
  });

  test('"Turn into" from the block menu works and undo restores the paragraph', async ({
    page,
  }) => {
    await page.keyboard.type('note');
    await page.locator(editable).first().hover();
    await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();
    await page.locator('[data-testid="block-menu"] [data-action="callout"]').click();

    await expect(page.locator('.block-callout .editable')).toHaveText('note');

    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.locator('.block-callout')).toHaveCount(0);
  });
});

test.describe('Image: adding', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the slash menu inserts an image block with a picker and a paragraph below', async ({
    page,
  }) => {
    await insertImageBlock(page);

    expect(await kinds(page)).toEqual(['image', 'paragraph']);

    await page.keyboard.type('after');
    await expect(page.locator(editable).first()).toHaveText('after');
  });

  test('embedding by link: normalises the address, rejects unsafe ones', async ({ page }) => {
    await insertImageBlock(page);
    const input = page.getByLabel('Image URL');

    for (const bad of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', '   ']) {
      await input.fill(bad);
      await input.press('Enter');
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.locator('.image-figure')).toHaveCount(0);
    }

    await input.fill(PNG_DATA_URL);
    await input.press('Enter');

    await expect(page.locator('.image-figure img')).toHaveAttribute('src', PNG_DATA_URL);
    expect((await doc(page))[0].props.src).toBe(PNG_DATA_URL);
  });

  test('a bare domain gets https://; an unreachable image shows a recoverable error', async ({
    page,
  }) => {
    await insertImageBlock(page);
    await page.route('https://images.invalid/**', (route) => route.abort());

    await page.getByLabel('Image URL').fill('images.invalid/a.png');
    await page.getByRole('button', { name: 'Embed' }).click();

    expect((await doc(page))[0].props.src).toBe('https://images.invalid/a.png');
    await expect(page.getByText('The image could not be loaded')).toBeVisible();

    await page.getByRole('button', { name: 'Replace' }).click();
    await expect(page.getByTestId('image-picker')).toBeVisible();
    expect((await doc(page))[0].props.src).toBe('');
  });

  test('uploading a file embeds it as a data URL', async ({ page }) => {
    await insertImageBlock(page);
    await page.getByTestId('image-file').setInputFiles(png('My Photo.png'));

    await expect(page.locator('.image-figure img')).toBeVisible();
    const [image] = await doc(page);

    expect(image.props.src).toBe(PNG_DATA_URL);
    expect(image.props.alt).toBe('My Photo');
  });

  test('unsupported types and oversized files are rejected with a message in the block', async ({
    page,
  }) => {
    await insertImageBlock(page);

    await page
      .getByTestId('image-file')
      .setInputFiles({ name: 'doc.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(page.getByRole('alert')).toContainText('Unsupported image type');

    await page
      .getByTestId('image-file')
      .setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(1_600_000) });
    await expect(page.getByRole('alert')).toContainText('larger than');

    expect((await doc(page))[0].props.src).toBe('');
  });

  test('pasting an image file from the clipboard replaces an empty paragraph; one undo removes it', async ({
    page,
  }) => {
    await page.locator(editable).first().click();
    await paste(page, { files: [pngFile()] });

    await expect(page.locator('.image-figure img')).toBeVisible();
    expect(await kinds(page)).toEqual(['image', 'paragraph']);
    expect((await doc(page))[0].props.src).toBe(PNG_DATA_URL);

    await page.keyboard.type('x'); // каретка стоит в абзаце под картинкой
    await expect(page.locator(editable).first()).toHaveText('x');
    await page.keyboard.press(`${modifier}+Z`);
    await page.keyboard.press(`${modifier}+Z`);

    expect(await kinds(page)).toEqual(['paragraph']);
  });

  test('a pasted image goes after the current block when the paragraph is not empty; several files keep their order', async ({
    page,
  }) => {
    await page.locator(editable).first().click();
    await page.keyboard.type('caption text');
    await paste(page, { files: [pngFile('a.png'), pngFile('b.png')] });

    await expect(page.locator('.image-figure img')).toHaveCount(2);
    expect(await kinds(page)).toEqual(['paragraph', 'image', 'image', 'paragraph']);
    expect((await doc(page)).slice(1, 3).map((r) => r.props.alt)).toEqual(['a', 'b']);
  });

  test('files that are not supported images, and files next to text, do not create images', async ({
    page,
  }) => {
    await page.locator(editable).first().click();
    await paste(page, { files: [{ name: 'a.pdf', type: 'application/pdf', base64: 'AAAA' }] });
    await paste(page, { text: 'spreadsheet cell', files: [pngFile()] }); // текст рядом → обычная вставка

    expect(await kinds(page)).toEqual(['paragraph']);
    expect((await doc(page))[0].text).toBe('spreadsheet cell');
  });

  test('dropping an image file inserts it after the block under the pointer', async ({ page }) => {
    await page.locator(editable).first().click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');

    const box = (await page.locator(editable).first().boundingBox())!;

    await page.evaluate(
      ([x, y, b64]) => {
        const dt = new DataTransfer();
        dt.items.add(
          new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'drop.png', {
            type: 'image/png',
          }),
        );
        (document.querySelector('.inkbrick-editor') as HTMLElement).dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: dt,
            clientX: x as number,
            clientY: y as number,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [box.x + 20, box.y + box.height / 2, PNG_BASE64] as const,
    );

    await expect(page.locator('.image-figure img')).toBeVisible();
    expect((await doc(page)).map((r) => `${r.flavour}:${r.text}`)).toEqual([
      'paragraph:one',
      'image:',
      'paragraph:two',
    ]);
  });
});

test.describe('Image: uploads (custom uploader)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('deleting the block while it uploads is safe: nothing reappears, no errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await paste(page, { files: [pngFile('slow.png')] });
    await expect(page.getByRole('status')).toHaveText('Uploading…');

    await page.evaluate(() => {
      const { editor } = (window as any).__inkbrick.main;
      const image = Object.values(editor.document.dump()).find(
        (block: any) => block.flavour === 'block:image',
      ) as { id: string };

      editor.execute('delete-block', { id: image.id });
    });

    await page.waitForTimeout(1000);

    expect(await kinds(page)).not.toContain('image');
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a block appears at once with an "Uploading…" state and is filled when the upload finishes', async ({
    page,
  }) => {
    await paste(page, { files: [pngFile('slow.png')] });

    await expect(page.getByRole('status')).toHaveText('Uploading…');
    expect((await kinds(page))[0]).toBe('image');

    await expect(page.locator('.image-figure img')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('a failed upload removes the empty block and reports the error', async ({ page }) => {
    await page.keyboard.type('keep');
    await paste(page, { files: [pngFile('fail.png')] });

    await expect
      .poll(() => page.evaluate(() => (window as any).__imageErrors))
      .toEqual(['Upload failed']);
    await expect.poll(() => kinds(page)).toEqual(['paragraph', 'paragraph']);
    await expect(page.locator('.block-image')).toHaveCount(0);
  });

  test('the picker upload uses the custom uploader too', async ({ page }) => {
    await page.keyboard.type('/image');
    await page.keyboard.press('Enter');
    await page.getByTestId('image-file').setInputFiles(png('fail-in-picker.png'));

    await expect(page.getByRole('alert')).toHaveText('Upload failed');
    await expect(page.getByTestId('image-picker')).toBeVisible();
  });
});

test.describe('Image: editing', () => {
  async function withImage(page: Page) {
    await page.goto('/');
    await insertImageBlock(page);
    await page.getByLabel('Image URL').fill(PNG_DATA_URL);
    await page.getByLabel('Image URL').press('Enter');
    await expect(page.locator('.image-figure img')).toBeVisible();
    await page.locator('.image-figure').hover();
  }

  test('alignment and width change the props and the layout', async ({ page }) => {
    await withImage(page);

    await page.getByRole('button', { name: 'Align right' }).click();
    await page.getByLabel('Image width').selectOption('50');

    expect((await doc(page))[0].props).toMatchObject({ align: 'right', width: 50 });
    await expect(page.locator('.image-figure')).toHaveAttribute('data-align', 'right');
    expect(
      await page.locator('.image-figure').evaluate((el) => (el as HTMLElement).style.width),
    ).toBe('50%');
  });

  test('caption and alt text are saved on Enter/blur — one history step each — and survive undo/redo', async ({
    page,
  }) => {
    await withImage(page);

    await page.getByLabel('Caption').fill('A tiny image');
    await page.getByLabel('Caption').press('Enter');
    await page.getByLabel('Alt text').fill('pixel');
    await page.getByLabel('Alt text').press('Enter');

    expect((await doc(page))[0].props).toMatchObject({ caption: 'A tiny image', alt: 'pixel' });
    await expect(page.locator('.image-figure img')).toHaveAttribute('alt', 'pixel');

    await page.locator(editable).last().click();
    await page.keyboard.press(`${modifier}+Z`); // alt
    await expect(page.getByLabel('Alt text')).toHaveValue('');
    await page.keyboard.press(`${modifier}+Z`); // caption
    await expect(page.getByLabel('Caption')).toHaveValue('');
  });

  test('typing in the caption does not leak into the document as text or shortcuts', async ({
    page,
  }) => {
    await withImage(page);

    await page.getByLabel('Caption').click();
    await page.keyboard.type('# not a heading /image');
    await page.keyboard.press('Escape'); // отмена: значение не сохраняется

    expect(await kinds(page)).toEqual(['image', 'paragraph']);
    expect((await doc(page))[0].props.caption).toBe('');
    await expect(page.getByTestId('slash-menu')).toHaveCount(0);
  });

  test('Replace returns to the picker; the image block has a handle and a working menu', async ({
    page,
  }) => {
    await withImage(page);

    await page.getByRole('button', { name: 'Replace image' }).click();
    await expect(page.getByTestId('image-picker')).toBeVisible();

    await page.getByLabel('Image URL').fill(PNG_DATA_URL);
    await page.getByLabel('Image URL').press('Enter');
    // Картинка 1×1 растягивается на всю ширину: наводим на её верх без прокрутки (прокрутка прячет ручку).
    await expect(page.locator('.image-figure img')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.image-figure').hover({ position: { x: 20, y: 20 } });
    await page.locator('[data-testid="block-handle"] [data-action="grip"]').click();
    await page.locator('[data-testid="block-menu"] [data-action="duplicate"]').click();

    await expect(page.locator('.image-figure img')).toHaveCount(2);
  });

  test('Backspace below an image removes it; Delete above it does nothing', async ({ page }) => {
    await withImage(page);
    await page.locator(editable).last().click();
    await page.keyboard.type('below');

    await page.locator(editable).last().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await expect(page.locator('.block-image')).toHaveCount(0);

    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.locator('.block-image')).toHaveCount(1);

    await page.evaluate(() => {
      const { editor } = (window as any).__inkbrick.main;
      const note = editor.document.getBlock(editor.document.rootId).children[0];
      const image = editor.document.getBlock(note).children[0];
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', parentId: note },
      });
      const above = editor.document.getBlock(note).children[0];
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: above, from: 0, to: 0, text: 'above' },
      });
      return image;
    });
    await page.locator(editable).first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Delete');

    expect((await doc(page)).map((r) => r.flavour)).toEqual(['paragraph', 'image', 'paragraph']);
    expect((await doc(page))[0].text).toBe('above');
  });
});

test.describe('Image: clipboard and HTML', () => {
  test.beforeEach(async ({ page, context }) => {
    await useSystemClipboard(context);
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('HTML figures and inline images become image blocks; unsafe or relative sources are ignored', async ({
    page,
  }) => {
    await paste(page, {
      html: `<figure><img src="${PNG_DATA_URL}" alt="pic"><figcaption>  The   caption </figcaption></figure>
        <p>text <img src="https://cdn.test/a.png" alt="remote"> more</p>
        <img src="/relative.png"><img src="javascript:window.__pwned=1"><img src="data:image/svg+xml;base64,PHN2Zz4=">
        <p><img src="http://x.test/no onerror" onerror="window.__pwned=1"></p>`,
    });

    const rows = await doc(page);

    expect(rows.map((r) => r.flavour)).toEqual(['image', 'paragraph', 'image', 'paragraph']);
    expect(rows[0].props).toMatchObject({ src: PNG_DATA_URL, alt: 'pic', caption: 'The caption' });
    expect(rows[1].text).toBe('text more');
    expect(rows[2].props.src).toBe('https://cdn.test/a.png');
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  });

  test('copying an image block puts a <figure> in the HTML and the caption in the plain text', async ({
    page,
  }) => {
    await paste(page, {
      html: `<figure><img src="${PNG_DATA_URL}" alt="pic"><figcaption>Cap</figcaption></figure><p>tail</p>`,
    });
    await page.locator(editable).last().click();
    await page.keyboard.press(`${modifier}+A`);
    await expect(page.locator('.block-image[data-selected="true"]')).toHaveCount(1); // выбранная картинка подсвечена
    await page.keyboard.press(`${modifier}+C`);

    const { html, text } = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return {
        html: await (await item.getType('text/html')).text(),
        text: await (await item.getType('text/plain')).text(),
      };
    });

    expect(html).toContain(
      `<figure><img src="${PNG_DATA_URL}" alt="pic"><figcaption>Cap</figcaption></figure>`,
    );
    expect(text).toBe('Cap\ntail');
  });

  test('an image pasted as an exact fragment keeps its props', async ({ page }) => {
    await page.evaluate((src) => {
      const dt = new DataTransfer();
      dt.setData(
        'application/x-inkbrick-fragment',
        JSON.stringify({
          blocks: [
            {
              flavour: 'block:image',
              props: { src, alt: 'a', caption: 'c', width: 50, align: 'left' },
              content: [],
              children: [],
              complete: true,
            },
          ],
        }),
      );
      const root = document.querySelector('.inkbrick-editor') as HTMLElement;
      root.focus();
      root.dispatchEvent(
        Object.defineProperty(
          new Event('paste', { bubbles: true, cancelable: true }),
          'clipboardData',
          { value: dt },
        ),
      );
    }, PNG_DATA_URL);

    expect((await doc(page))[0]).toMatchObject({
      flavour: 'image',
      props: { src: PNG_DATA_URL, alt: 'a', caption: 'c', width: 50, align: 'left' },
    });
  });

  test('a hostile fragment with an unsafe image source degrades safely', async ({ page }) => {
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData(
        'application/x-inkbrick-fragment',
        JSON.stringify({
          blocks: [
            {
              flavour: 'block:image',
              props: { src: 'javascript:window.__pwned=1', caption: 'x' },
              content: [],
              children: [],
              complete: true,
            },
          ],
        }),
      );
      const root = document.querySelector('.inkbrick-editor') as HTMLElement;
      root.focus();
      root.dispatchEvent(
        Object.defineProperty(
          new Event('paste', { bubbles: true, cancelable: true }),
          'clipboardData',
          { value: dt },
        ),
      );
    });

    const rows = await doc(page);

    expect(rows.every((r) => r.props.src !== 'javascript:window.__pwned=1')).toBe(true);
    await expect(page.locator('.block-image img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  });
});

test.describe('Image: read-only', () => {
  test('no editing controls; the caption is plain text', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((src) => {
      const { editor } = (window as any).__inkbrick.main;
      const note = editor.document.getBlock(editor.document.rootId).children[0];
      const first = editor.document.getBlock(note).children[0];

      editor.dispatch({
        type: 'insertBlock',
        payload: {
          flavour: 'block:image',
          afterId: first,
          props: { src, caption: 'Static caption' },
        },
      });
      editor.dispatch({ type: 'insertBlock', payload: { flavour: 'block:image', afterId: first } });
    }, PNG_DATA_URL);
    await page.getByTestId('mode-read').click();

    await expect(page.locator('.image-figure img')).toBeVisible();
    await expect(page.locator('.image-tools')).toHaveCount(0);
    await expect(page.getByLabel('Caption')).toHaveCount(0);
    await expect(page.locator('figcaption')).toHaveText('Static caption');
    await expect(page.getByTestId('image-picker')).toHaveCount(0);
    await expect(page.getByText('No image')).toBeVisible();
  });
});

test.describe('Select all', () => {
  test('selects the text even when the document starts with a callout or a list (non-editable marker first)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
    await page.keyboard.type('/callout');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Only block');

    await page.keyboard.press(`${modifier}+A`);
    expect(await page.evaluate(() => getSelection()!.toString())).toContain('Only block');

    await page.keyboard.press('Backspace');
    expect((await doc(page)).map((r) => [r.flavour, r.text])).toEqual([['callout', '']]);

    await page.keyboard.type('- item'); // не шорткат: это уже callout, но выделение и ввод работают
    await page.keyboard.press(`${modifier}+A`);
    expect(await page.evaluate(() => getSelection()!.toString())).toContain('- item');
  });
});

test.describe('Select all with blocks that have no text', () => {
  test.beforeEach(async ({ page, context }) => {
    await useSystemClipboard(context);
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('a document that starts with an image: select all + delete clears everything', async ({
    page,
  }) => {
    await paste(page, {
      html: `<figure><img src="${PNG_DATA_URL}" alt="pic"></figure><p>text</p>`,
    });
    expect((await kinds(page))[0]).toBe('image');

    await page.locator(editable).last().click();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press('Backspace');

    expect(await kinds(page)).toEqual(['paragraph']);
    expect((await doc(page))[0].text).toBe('');

    await page.keyboard.type('fresh');
    expect((await doc(page))[0].text).toBe('fresh');

    await page.keyboard.press(`${modifier}+Z`);
    await page.keyboard.press(`${modifier}+Z`);
    expect(await kinds(page)).toContain('image');
  });

  test('a document that starts with a divider: select all + typing replaces everything', async ({
    page,
  }) => {
    await page.keyboard.type('--- ');
    await page.keyboard.type('after');
    await page.keyboard.press('Enter');
    await page.keyboard.type('more');
    expect((await kinds(page))[0]).toBe('divider');

    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.type('x');

    expect((await doc(page)).map((r) => [r.flavour, r.text])).toEqual([['paragraph', 'x']]);
  });

  test('select all + copy includes a leading image and the text after it', async ({ page }) => {
    await paste(page, {
      html: `<figure><img src="${PNG_DATA_URL}" alt="pic"><figcaption>Cap</figcaption></figure><p>text</p>`,
    });
    await page.locator(editable).last().click();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+C`);

    const { html, text } = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return {
        html: await (await item.getType('text/html')).text(),
        text: await (await item.getType('text/plain')).text(),
      };
    });

    expect(html).toContain('<figure><img');
    expect(html).toContain('<p>text</p>');
    expect(text).toBe('Cap\ntext');
  });

  test('clicking next to a divider still puts the caret in text (no typing into the divider)', async ({
    page,
  }) => {
    await page.keyboard.type('top');
    await page.keyboard.press('Enter');
    await page.keyboard.type('--- ');
    await page.keyboard.type('below');
    await page.locator('.block-divider').click();
    await page.keyboard.type('x');

    const rows = await doc(page);
    expect(rows.find((r) => r.flavour === 'divider')!.text).toBe('');
    expect(rows.map((r) => r.text).join('|')).toContain('x');
  });
});
