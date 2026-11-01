import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const toolbar = '[data-testid="toolbar"]';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

async function selectRange(page: Page, from: [number, number], to: [number, number]) {
  await page.evaluate(
    ([f, t]) => {
      const els = [...document.querySelectorAll('.editable')];
      const point = (el: Element, offset: number) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let rest = offset;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const len = n.textContent!.length;
          if (rest <= len) return [n, rest] as const;
          rest -= len;
        }
        return [el, 0] as const;
      };
      const [a, ao] = point(els[f[0]], f[1]);
      const [b, bo] = point(els[t[0]], t[1]);
      (document.querySelector('.inkbrick-editor') as HTMLElement).focus();
      getSelection()!.setBaseAndExtent(a, ao, b, bo);
    },
    [from, to] as const,
  );
}

const texts = (page: Page) => page.locator(editable).allTextContents();

test.describe('Floating toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('appears over a selection and hides when the caret collapses', async ({ page }) => {
    await typeBlocks(page, ['hello world']);
    await expect(page.locator(toolbar)).toHaveCount(0);

    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.locator(toolbar)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.locator(toolbar)).toHaveCount(0);
  });

  test('buttons toggle formats and reflect the current state', async ({ page }) => {
    await typeBlocks(page, ['hello world']);
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');

    const bold = page.locator(`${toolbar} [data-format="bold"]`);
    await expect(bold).toHaveAttribute('aria-pressed', 'false');

    await bold.click();
    await expect(page.locator('.editable strong')).toHaveText('world');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    await page.locator(`${toolbar} [data-format="italic"]`).click();
    await expect(page.locator('.editable strong em, .editable em strong')).toHaveText('world');

    await bold.click();
    await expect(page.locator('.editable strong')).toHaveCount(0);
    await expect(page.locator('.editable em')).toHaveText('world');

    await page.keyboard.type('there');
    await expect(page.locator(editable).first()).toHaveText('hello there');
  });

  test('works for a selection across several blocks', async ({ page }) => {
    await typeBlocks(page, ['abc', 'def', 'ghi']);
    await selectRange(page, [0, 1], [2, 2]);

    await expect(page.locator(toolbar)).toBeVisible();
    await page.locator(`${toolbar} [data-format="underline"]`).click();

    expect(await page.locator('.editable u').allTextContents()).toEqual(['bc', 'def', 'gh']);
    await expect(page.locator(`${toolbar} [data-format="underline"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('is not shown for text inside a code block', async ({ page }) => {
    await typeBlocks(page, ['``` ']);
    await page.keyboard.type('code');
    await page.keyboard.press('Shift+Home');

    await expect(page.locator(toolbar)).toHaveCount(0);
  });

  test('is hidden while the mouse selects and appears on mouse up', async ({ page }) => {
    await typeBlocks(page, ['select me please']);

    const box = (await page.locator(editable).first().boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 6 });
    await expect(page.locator(toolbar)).toHaveCount(0);

    await page.mouse.up();
    await expect(page.locator(toolbar)).toBeVisible();
  });

  test('a click in the editor hides it', async ({ page }) => {
    await typeBlocks(page, ['hello']);
    await page.keyboard.press('Shift+Home');
    await expect(page.locator(toolbar)).toBeVisible();

    await page.locator(editable).first().click();
    await expect(page.locator(toolbar)).toHaveCount(0);
  });

  test('formatting from the toolbar is a single undo step', async ({ page }) => {
    await typeBlocks(page, ['hello']);
    await page.keyboard.press('Shift+Home');
    await page.locator(`${toolbar} [data-format="strike"]`).click();
    await expect(page.locator('.editable s')).toHaveText('hello');

    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.locator('.editable s')).toHaveCount(0);
  });
});

test.describe('Links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await typeBlocks(page, ['see docs here']);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft'); // «here»
  });

  test('the link button opens an input; Enter applies a normalized link', async ({ page }) => {
    await page.locator(`${toolbar} [data-format="link"]`).click();

    const input = page.getByLabel('Link URL');
    await expect(input).toBeFocused();

    await input.fill('example.com/page');
    await input.press('Enter');

    const link = page.locator('.editable a');
    await expect(link).toHaveText('here');
    await expect(link).toHaveAttribute('href', 'https://example.com/page');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    await expect(page.locator(`${toolbar} [data-format="link"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('!');
    await expect(page.locator(editable).first()).toHaveText('see docs here!');
  });

  test('Ctrl/Cmd+K opens the input prefilled with the current link; it can be changed and removed', async ({
    page,
  }) => {
    await page.keyboard.press(`${modifier}+K`);
    await page.getByLabel('Link URL').fill('https://one.test');
    await page.getByLabel('Link URL').press('Enter');
    await expect(page.locator('.editable a')).toHaveAttribute('href', 'https://one.test');

    await page.keyboard.press(`${modifier}+K`);
    await expect(page.getByLabel('Link URL')).toHaveValue('https://one.test');
    await page.getByLabel('Link URL').fill('https://two.test');
    await page.getByLabel('Link URL').press('Enter');
    await expect(page.locator('.editable a')).toHaveAttribute('href', 'https://two.test');

    await page.keyboard.press(`${modifier}+K`);
    await page.getByLabel('Remove link').click();
    await expect(page.locator('.editable a')).toHaveCount(0);
    await expect(page.locator(editable).first()).toHaveText('see docs here');
  });

  test('rejects unsafe addresses: marks the field invalid and changes nothing', async ({
    page,
  }) => {
    await page.locator(`${toolbar} [data-format="link"]`).click();
    const input = page.getByLabel('Link URL');

    await input.fill('javascript:alert(1)');
    await input.press('Enter');

    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.editable a')).toHaveCount(0);
  });

  test('Escape cancels and returns the selection to the editor', async ({ page }) => {
    await page.locator(`${toolbar} [data-format="link"]`).click();
    await page.getByLabel('Link URL').press('Escape');

    await expect(page.getByLabel('Link URL')).toHaveCount(0);
    await page.keyboard.type('there');
    await expect(page.locator(editable).first()).toHaveText('see docs there');
  });

  test('applying a link is one undo step', async ({ page }) => {
    await page.locator(`${toolbar} [data-format="link"]`).click();
    await page.getByLabel('Link URL').fill('/docs');
    await page.getByLabel('Link URL').press('Enter');
    await expect(page.locator('.editable a')).toHaveCount(1);

    await page.keyboard.press(`${modifier}+Z`);
    await expect(page.locator('.editable a')).toHaveCount(0);
  });

  test('Ctrl/Cmd+click on a link opens it in a new tab; a plain click only places the caret', async ({
    page,
    context,
  }) => {
    await page.locator(`${toolbar} [data-format="link"]`).click();
    await page.getByLabel('Link URL').fill('/?linked=1');
    await page.getByLabel('Link URL').press('Enter');

    const link = page.locator('.editable a');

    await link.click();
    expect(context.pages().length).toBe(1);

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      link.click({ modifiers: [modifier as 'Control' | 'Meta'] }),
    ]);
    expect(popup.url()).toContain('linked=1');
  });

  test('a link on a multi-block selection covers each block', async ({ page }) => {
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second line');
    await selectRange(page, [0, 4], [1, 6]);

    await page.keyboard.press(`${modifier}+K`);
    await page.getByLabel('Link URL').fill('https://x.test');
    await page.getByLabel('Link URL').press('Enter');

    expect(await page.locator('.editable a').allTextContents()).toEqual(['docs here', 'second']);
    expect(await texts(page)).toEqual(['see docs here', 'second line']);
  });
});
