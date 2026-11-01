import { readFile } from 'node:fs/promises';

import { test, expect, type Download, type Page } from '@playwright/test';

import { useSetting, useTool } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const open = indexedDB.open('inkbrick-sandbox', 1);

        open.onupgradeneeded = () => open.result.createObjectStore('documents');
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('documents').objectStore('documents').get('document');

          request.onsuccess = () => {
            db.close();
            resolve(request.result === undefined ? null : JSON.stringify(request.result));
          };
        };
      }),
  );

const putStored = (page: Page, value: unknown) =>
  page.evaluate(
    (data) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('inkbrick-sandbox', 1);

        open.onupgradeneeded = () => open.result.createObjectStore('documents');
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction('documents', 'readwrite');

          transaction.objectStore('documents').put(data, 'document');
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
    value,
  );

async function typeText(page: Page, text: string) {
  await page.locator(editable).first().click();
  await page.keyboard.type(text);
  await expect(page.locator(editable).first()).toHaveText(text);
}

async function exportJson(page: Page): Promise<{ download: Download; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    useTool(page, 'export-json'),
  ]);

  return { download, text: await readFile((await download.path())!, 'utf8') };
}

const importJson = (page: Page, content: string, name = 'document.json') =>
  page.getByTestId('import-file').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });

test.describe('Saving the document in the browser', () => {
  test('survives a reload when persistence is on', async ({ page }) => {
    await page.goto('/?persist=1');
    await typeText(page, 'remember me');
    await expect.poll(() => stored(page)).toContain('remember me');

    await page.reload();

    await expect(page.locator(editable).first()).toHaveText('remember me');
  });

  test('is off for automated runs by default, so every test starts clean', async ({ page }) => {
    await page.goto('/');
    await typeText(page, 'not saved');
    await page.waitForTimeout(800);

    expect(await stored(page)).toBeNull();
  });

  test('a document that cannot be opened is dropped instead of breaking the page', async ({
    page,
  }) => {
    await page.goto('/?persist=1');
    await putStored(page, { not: 'a snapshot' });
    await page.reload();

    await expect(page.locator(editable).first()).toBeVisible();
    await expect(page.getByTestId('notice')).toContainText('could not be opened');
    expect(await stored(page)).toBeNull();
  });

  test('a large document (50 000 blocks) survives a reload too', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/?persist=1');
    await useTool(page, 'load-large');
    await expect.poll(() => stored(page), { timeout: 30_000 }).not.toBeNull();

    await page.reload();

    await expect(page.locator(editable).first()).toBeVisible();
    expect(
      await page.evaluate(
        () => Object.keys((window as any).__inkbrick.main.snapshot().blocks).length,
      ),
    ).toBeGreaterThan(50_000);
  });
});

test.describe('JSON file: download and upload', () => {
  test('download gives a snapshot file with the document', async ({ page }) => {
    await page.goto('/');
    await typeText(page, 'export me');

    const { download, text } = await exportJson(page);
    const snapshot = JSON.parse(text);

    expect(download.suggestedFilename()).toMatch(/^inkbrick-document-.*\.json$/);
    expect(typeof snapshot.rootId).toBe('string');
    expect(JSON.stringify(snapshot.blocks)).toContain('export me');
  });

  test('upload replaces the document with the file; downloaded files load back', async ({
    page,
  }) => {
    await page.goto('/');
    await typeText(page, 'version one');

    const { text } = await exportJson(page);

    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.type('version two');
    await expect(page.locator(editable).first()).toHaveText('version two');

    await importJson(page, text, 'one.json');

    await expect(page.locator(editable).first()).toHaveText('version one');
    await expect(page.getByTestId('notice')).toContainText('one.json');

    await page.locator(editable).first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(page.locator(editable).first()).toHaveText('version one!');
  });

  test('the uploaded document is also what the next load restores', async ({ page }) => {
    await page.goto('/?persist=1');
    await typeText(page, 'old');

    const { text } = await exportJson(page);

    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.type('newer');
    await importJson(page, text);
    await expect(page.locator(editable).first()).toHaveText('old');

    await expect.poll(() => stored(page)).toContain('old');
    await page.reload();

    await expect(page.locator(editable).first()).toHaveText('old');
  });

  test('a damaged snapshot is repaired and the notice says so', async ({ page }) => {
    await page.goto('/');
    await typeText(page, 'still here');

    const snapshot = await page.evaluate(() => (window as any).__inkbrick.main.snapshot());
    const note = snapshot.blocks[snapshot.rootId].children[0];

    snapshot.blocks[note].children.push('ghost');

    await importJson(page, JSON.stringify(snapshot), 'broken.json');

    await expect(page.getByTestId('notice')).toContainText(/fixed: \d+/);
    await expect(page.locator(editable).first()).toHaveText('still here');
  });

  test('files that are not documents are rejected and the document is untouched', async ({
    page,
  }) => {
    await page.goto('/');
    await typeText(page, 'untouched');

    await importJson(page, 'this is not json');
    await expect(page.getByTestId('notice')).toContainText('is not JSON');
    await expect(page.getByTestId('notice')).toHaveAttribute('role', 'alert');

    await importJson(page, '{"hello":"world"}');
    await expect(page.getByTestId('notice')).toContainText('not a Inkbrick document snapshot');

    await expect(page.locator(editable).first()).toHaveText('untouched');
  });

  test('the same file can be uploaded twice in a row', async ({ page }) => {
    await page.goto('/');
    await typeText(page, 'twice');

    const { text } = await exportJson(page);

    await importJson(page, text);
    await expect(page.getByTestId('notice')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await importJson(page, text);
    await expect(page.getByTestId('notice')).toBeVisible();
    await expect(page.locator(editable).first()).toHaveText('twice');
  });
});

test.describe('Reset', () => {
  test('clears the document, theme and language, then reloads from scratch', async ({ page }) => {
    await page.goto('/?persist=1&lang=ru');
    await useSetting(page, '[data-theme="dark"]');
    await typeText(page, 'to be erased');
    await expect.poll(() => stored(page)).toContain('to be erased');
    await expect(page.locator('html')).toHaveAttribute('data-inkbrick-theme', 'dark');

    page.once('dialog', (dialog) => dialog.accept());
    await useTool(page, 'reset-data');

    await expect(page.locator(editable).first()).toHaveText('');
    expect(await stored(page)).toBeNull();
    await expect(page.locator('html')).not.toHaveAttribute('data-inkbrick-theme', /.+/);
    expect(page.url()).not.toContain('persist');
  });

  test('does nothing if the confirmation is declined', async ({ page }) => {
    await page.goto('/?persist=1');
    await typeText(page, 'keep me');
    await expect.poll(() => stored(page)).toContain('keep me');

    page.once('dialog', (dialog) => dialog.dismiss());
    await useTool(page, 'reset-data');

    await expect(page.locator(editable).first()).toHaveText('keep me');
    expect(await stored(page)).toContain('keep me');
  });
});
