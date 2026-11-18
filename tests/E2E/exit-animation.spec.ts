import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Выход длится секунду: в это окно можно спокойно проверить, что элемент уходит, а не пропадает сразу. */
const SLOW = ':root { --inkbrick-disappear-duration: 1s; }';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

const stateOf = (page: Page, selector: string) =>
  page.evaluate((query) => {
    const element = document.querySelector(query);
    const wrapper = element?.closest('[data-inkbrick-presence]') as HTMLElement | null;

    if (!element || !wrapper) return null;

    const style = getComputedStyle(wrapper.firstElementChild!);

    return { state: wrapper.dataset.state, animation: style.animationName };
  }, selector);

/** Открывает окно, закрывает его и проверяет: оно в состоянии `closed`, гаснет `inkbrick-fade-out`, потом удаляется. */
async function expectFadesOut(
  page: Page,
  selector: string,
  open: () => Promise<void>,
  close: () => Promise<void>,
) {
  await open();
  await expect(page.locator(selector)).toBeVisible();
  expect(await stateOf(page, selector)).toMatchObject({ state: 'open' });

  await close();

  // Некоторые окна закрываются не сразу (после смены выделения, на следующем такте): состояние ждём, а не читаем мгновенно.
  await expect
    .poll(() => stateOf(page, selector), { timeout: 2000 })
    .toEqual({ state: 'closed', animation: 'inkbrick-fade-out' });
  await expect(page.locator(selector)).toHaveCount(0, { timeout: 4000 });
}

test.describe('Fade out', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await page.addStyleTag({ content: SLOW });
    await typeBlocks(page, ['hello world']);
  });

  test('the slash menu fades out when it closes', async ({ page }) => {
    await expectFadesOut(
      page,
      '[data-testid="slash-menu"]',
      async () => {
        await page.keyboard.press('Enter');
        await page.keyboard.type('/');
      },
      () => page.keyboard.press('Escape'),
    );
  });

  test('the block handle and the block menu fade out, and the handle comes back as the same node', async ({
    page,
  }) => {
    const handle = '[data-testid="block-handle"]';

    await page.locator(editable).first().hover();
    await expect(page.locator(handle)).toBeVisible();
    await page.locator(handle).evaluate((element) => element.setAttribute('data-probe', '1'));

    await page.mouse.move(2, 2);
    await expect.poll(() => stateOf(page, handle).then((value) => value?.state)).toBe('closed');

    // Вернулись, пока она гаснет: тот же узел, снова открыт.
    await page.locator(editable).first().hover();
    await expect.poll(() => stateOf(page, handle).then((value) => value?.state)).toBe('open');
    await expect(page.locator(`${handle}[data-probe="1"]`)).toHaveCount(1);

    await expectFadesOut(
      page,
      '[data-testid="block-menu"]',
      async () => {
        await page.locator(`${handle} [data-action="grip"]`).click();
      },
      () => page.keyboard.press('Escape'),
    );
  });

  test('the context menu fades out', async ({ page }) => {
    await expectFadesOut(
      page,
      '[data-testid="context-menu"]',
      async () => {
        const box = (await page.locator(editable).first().boundingBox())!;

        await page.mouse.click(box.x + 10, box.y + box.height / 2, { button: 'right' });
      },
      () => page.keyboard.press('Escape'),
    );
  });

  test('the command palette and the find panel fade out', async ({ page }) => {
    await expectFadesOut(
      page,
      '[data-testid="command-palette"]',
      () => page.keyboard.press(`${modifier}+Shift+p`),
      () => page.keyboard.press('Escape'),
    );

    // Поиск открывается по Ctrl+F: перед этим каретка снова в тексте.
    await page.locator(editable).first().click();
    await expectFadesOut(
      page,
      '[data-testid="find-panel"]',
      () => page.keyboard.press(`${modifier}+f`),
      () => page.keyboard.press('Escape'),
    );
  });

  test('the drop line fades out after a drop', async ({ page }) => {
    await typeBlocks(page, ['one', 'two', 'three']);
    const line = '[data-testid="drop-indicator"]';

    await page.locator(editable).first().hover();
    const grip = (await page
      .locator('[data-testid="block-handle"] [data-action="grip"]')
      .boundingBox())!;
    const target = (await page.locator(editable).nth(2).boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 30, target.y + target.height - 3, { steps: 6 });
    await expect(page.locator(line)).toBeVisible();
    await page.mouse.up();

    await expect
      .poll(() => stateOf(page, line), { timeout: 2000 })
      .toEqual({ state: 'closed', animation: 'inkbrick-fade-out' });
    await expect(page.locator(line)).toHaveCount(0, { timeout: 4000 });
  });
});

test.describe('Fade out: toolbar and token', () => {
  test('the floating toolbar fades out when the selection collapses', async ({ page }) => {
    await page.goto('/?formatting=toolbar');
    await page.addStyleTag({ content: SLOW });
    await typeBlocks(page, ['hello world']);

    await expectFadesOut(
      page,
      '[data-testid="toolbar"]',
      async () => {
        for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
      },
      () => page.keyboard.press('ArrowRight'),
    );
  });

  test('there is no waiting with prefers-reduced-motion or with the token at 0ms', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?lang=en');
    await page.addStyleTag({ content: SLOW });
    await typeBlocks(page, ['hello world']);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.locator('[data-testid="slash-menu"]')).toBeVisible();
    await page.keyboard.press('Escape');

    // Без анимации окно удаляется сразу, а не через секунду.
    expect(await page.locator('[data-testid="slash-menu"]').count()).toBe(0);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addStyleTag({ content: ':root { --inkbrick-disappear-duration: 0ms; }' });
    // Esc закрыл меню, а набранный «/» остался в тексте: стираем его, иначе второй «/» не откроет меню.
    await page.keyboard.press('Backspace');
    await page.keyboard.type('/');
    await expect(page.locator('[data-testid="slash-menu"]')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.locator('[data-testid="slash-menu"]').count()).toBe(0);
  });
});
