import { test, expect, type Locator, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Сворачивание идёт 3 секунды: в это окно можно проверить, что блоки именно уходят, а не пропадают сразу. */
const SLOW = ':root { --inkbrick-collapse-duration: 3s; }';

const toggle = '[data-inkbrick-block="toggle"]';
const toggleButton = `${toggle} [data-inkbrick-part="toggle"]`;
const toggleKids = `${toggle} [data-inkbrick-part="children"]`;
const listFold =
  '[data-inkbrick-block="list"][data-foldable] > [data-inkbrick-part="row"] > [data-inkbrick-part="fold"]';
const listKids = '[data-inkbrick-block="list"] [data-inkbrick-part="children"]';
const heading = (page: Page, text: string) =>
  page.locator('[data-inkbrick-block="heading"]', { hasText: text });

const animations = (locator: Locator) =>
  locator.evaluate((element) => element.getAnimations().length);
const height = (locator: Locator) =>
  locator.evaluate((element) => Math.round(element.getBoundingClientRect().height));

async function toggleWithKids(page: Page) {
  await page.goto('/?lang=en');
  await page.addStyleTag({ content: SLOW });
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+End`);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/toggle');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Details');
  await page.keyboard.press('Enter');
  await page.keyboard.type('hidden one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('hidden two');
}

async function nestedList(page: Page) {
  await page.goto('/?lang=en');
  await page.addStyleTag({ content: SLOW });
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');
  await page.keyboard.type('- parent');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('child one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('child two');
}

async function outline(page: Page) {
  await page.goto('/?lang=en');
  await page.addStyleTag({ content: SLOW });
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+End`);
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Fold me');
  await page.keyboard.press('Enter');
  await page.keyboard.type('first inside');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second inside');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Stay visible');
}

test.describe('Collapse animation: toggle', () => {
  test('the content shrinks while it leaves and is removed afterwards; opening grows it back', async ({
    page,
  }) => {
    await toggleWithKids(page);

    const kids = page.locator(toggleKids);
    const full = await height(kids);

    expect(full).toBeGreaterThan(20);

    await page.locator(toggleButton).click();

    // Блоки ещё в дереве и сжимаются; у элемента идёт анимация, а `overflow` временно скрыт.
    await expect(kids).toHaveCount(1);
    expect(await animations(kids)).toBeGreaterThan(0);
    await expect.poll(() => height(kids), { timeout: 3000 }).toBeLessThan(full);
    expect(await kids.evaluate((element) => element.style.overflow)).toBe('hidden');

    await expect(kids).toHaveCount(0, { timeout: 6000 });

    await page.locator(toggleButton).click();
    await expect(kids).toHaveCount(1);
    expect(await animations(kids)).toBeGreaterThan(0);
    await expect.poll(() => height(kids), { timeout: 8000 }).toBe(full);
    await expect.poll(() => animations(kids), { timeout: 8000 }).toBe(0);
    expect(await kids.evaluate((element) => element.style.overflow)).toBe('');
  });

  test('a second click in the middle of the animation turns around from where it is', async ({
    page,
  }) => {
    await toggleWithKids(page);

    const kids = page.locator(toggleKids);
    const full = await height(kids);

    await page.locator(toggleButton).click();
    await expect.poll(() => height(kids), { timeout: 3000 }).toBeLessThan(full - 10);

    const middle = await height(kids);

    await page.locator(toggleButton).click();

    // Не прыжок к нулю или к полной высоте: сразу после разворота высота рядом с серединой.
    const after = await height(kids);

    expect(Math.abs(after - middle)).toBeLessThan(full / 3);

    await expect.poll(() => height(kids), { timeout: 8000 }).toBe(full);
    await expect(kids).toHaveCount(1);
    await expect(page.locator(toggleButton)).toHaveAttribute('aria-expanded', 'true');
  });

  test('the arrow turns smoothly', async ({ page }) => {
    await toggleWithKids(page);

    const transition = await page
      .locator(`${toggleButton} svg`)
      .evaluate((element) => getComputedStyle(element).transitionProperty);

    expect(transition).toContain('transform');
  });
});

test.describe('Collapse animation: list items and headings', () => {
  test('nested list items leave and come back with an animation', async ({ page }) => {
    await nestedList(page);

    const kids = page.locator(listKids);

    await page.locator(listFold).click();
    await expect(kids).toHaveCount(1);
    expect(await animations(kids)).toBeGreaterThan(0);
    await expect(kids).toHaveCount(0, { timeout: 6000 });

    await page.locator(listFold).click();
    await expect(kids).toHaveCount(1);
    expect(await animations(kids)).toBeGreaterThan(0);
    await expect.poll(() => animations(kids), { timeout: 8000 }).toBe(0);
  });

  test('the blocks of a folded section leave one by one in place, then the next heading stays', async ({
    page,
  }) => {
    await outline(page);

    const inside = page.locator(editable, { hasText: 'first inside' });
    const block = page.locator('[data-block-id]', { has: inside }).last();

    await heading(page, 'Fold me').hover();
    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();

    // Блоки раздела ещё на странице и анимируются, заголовок ниже едет вверх по мере того, как они сжимаются.
    await expect(inside).toHaveCount(1);
    expect(await animations(block)).toBeGreaterThan(0);
    await expect(inside).toHaveCount(0, { timeout: 6000 });
    await expect(heading(page, 'Stay visible')).toBeVisible();

    await heading(page, 'Fold me').locator('[data-inkbrick-part="fold"]').click();
    await expect(inside).toHaveCount(1);
    await expect
      .poll(() => animations(page.locator('[data-block-id]', { has: inside }).last()), {
        timeout: 8000,
      })
      .toBe(0);
    await expect(page.locator(editable, { hasText: 'second inside' })).toHaveCount(1);
  });

  test('a section of many blocks folds at once, without an animation', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.addStyleTag({ content: SLOW });
    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+End`);
    await page.keyboard.press('Enter');
    await page.keyboard.type('# Big');

    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Enter');
      await page.keyboard.type(`line ${i}`);
    }

    await heading(page, 'Big').hover();
    await heading(page, 'Big').locator('[data-inkbrick-part="fold"]').click();

    await expect(page.locator(editable, { hasText: 'line 0' })).toHaveCount(0, { timeout: 1500 });
  });
});

test.describe('Collapse animation: off switches', () => {
  test('with prefers-reduced-motion and with the token at 0ms nothing waits', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toggleWithKids(page);

    await page.locator(toggleButton).click();
    expect(await page.locator(toggleKids).count()).toBe(0);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addStyleTag({ content: ':root { --inkbrick-collapse-duration: 0ms; }' });
    await page.locator(toggleButton).click();
    await expect(page.locator(toggleKids)).toHaveCount(1);
    await page.locator(toggleButton).click();
    expect(await page.locator(toggleKids).count()).toBe(0);
  });
});
