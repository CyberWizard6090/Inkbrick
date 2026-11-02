import { test, expect, type Page } from '@playwright/test';

const code = '[data-inkbrick-block="code"]';
const content = `${code} [data-inkbrick-part="content"]`;
const language = `${code} [data-inkbrick-part="language"]`;
const list = '[data-inkbrick-ui="select"]';

const codeProps = (page: Page) =>
  page.evaluate(() => {
    const snap = (window as any).__inkbrick.main.snapshot();

    return Object.values<any>(snap.blocks).find((block) => block.flavour === 'block:code').props;
  });

async function startCode(page: Page, text = 'x') {
  await page.goto('/?lang=en');
  await page.locator('.editable').first().click();
  await page.keyboard.type('``` ');
  await expect(page.locator(code)).toHaveCount(1);
  await page.keyboard.type(text);
}

test.describe('Code block: language list', () => {
  test('opens from the keyboard, moves with arrows and type-ahead, and returns focus', async ({
    page,
  }) => {
    await startCode(page);
    await page.locator(language).focus();
    await page.keyboard.press('ArrowDown');

    await expect(page.locator(list)).toBeFocused();
    await expect(page.locator(`${list} [aria-selected="true"]`)).toHaveText('Plain text');

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    await expect(page.locator(list)).toHaveCount(0);
    await expect(page.locator(language)).toBeFocused();
    await expect(page.locator(code)).toHaveAttribute('data-language', 'yaml');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('r');
    await page.keyboard.press('Enter');

    await expect(page.locator(code)).toHaveAttribute('data-language', 'rust');
    await expect(page.locator(content)).toHaveText('x');
  });

  test('Escape and a click outside close it without changing the language', async ({ page }) => {
    await startCode(page);
    await page.locator(language).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');

    await expect(page.locator(list)).toHaveCount(0);
    await expect(page.locator(code)).toHaveAttribute('data-language', 'plain');

    await page.locator(language).click();
    await expect(page.locator(list)).toBeVisible();
    await page.mouse.click(5, 5);

    await expect(page.locator(list)).toHaveCount(0);
    expect(await codeProps(page)).toEqual({ language: 'plain' });
  });
});

test.describe('Code block: collapse', () => {
  test('hides the code with an animation, stores the state and keeps the text', async ({
    page,
  }) => {
    await startCode(page, 'a\nb\nc');
    await page.getByRole('button', { name: 'Collapse code' }).click();

    await expect(page.locator(code)).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator(`${code} [data-inkbrick-part="summary"]`)).toHaveText('Lines: 3');
    await expect
      .poll(() =>
        page.locator(`${code} [data-inkbrick-part="body"]`).evaluate((el) => el.clientHeight),
      )
      .toBe(0);
    expect(await codeProps(page)).toEqual({ language: 'plain', collapsed: true });

    await page.keyboard.type('zzz');
    await expect(page.locator(content)).toHaveText('a\nb\nc');

    await page.getByRole('button', { name: 'Expand code' }).click();
    await expect(page.locator(code)).not.toHaveAttribute('data-collapsed');
    await expect
      .poll(() =>
        page.locator(`${code} [data-inkbrick-part="body"]`).evaluate((el) => el.clientHeight),
      )
      .toBeGreaterThan(30);
    expect(await codeProps(page)).toEqual({ language: 'plain', collapsed: false });
  });

  test('in read mode collapses only locally', async ({ page }) => {
    await startCode(page);
    await page.getByRole('button', { name: 'Read', exact: true }).click();
    await page.getByRole('button', { name: 'Collapse code' }).click();

    await expect(page.locator(code)).toHaveAttribute('data-collapsed', 'true');
    expect(await codeProps(page)).toEqual({ language: 'plain' });
  });
});

test.describe('Code block: caption', () => {
  test('is added from the toolbar, saved on Enter and exported with the code', async ({ page }) => {
    await startCode(page);
    await page.getByRole('button', { name: 'Add a caption' }).click();

    const caption = page.getByLabel('Code caption');
    await expect(caption).toBeFocused();
    await caption.fill('Output of the script');
    await caption.press('Enter');

    expect(await codeProps(page)).toEqual({ language: 'plain', caption: 'Output of the script' });
    await expect(page.getByRole('button', { name: 'Add a caption' })).toHaveCount(0);
    await expect(page.locator(content)).toHaveText('x');
  });

  test('an empty caption field disappears on Escape', async ({ page }) => {
    await startCode(page);
    await page.getByRole('button', { name: 'Add a caption' }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByLabel('Code caption')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add a caption' })).toBeVisible();
    expect(await codeProps(page)).toEqual({ language: 'plain' });
  });
});

test.describe('Image picker', () => {
  test('a file dropped on the picker fills this block instead of adding another one', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await page.locator('.editable').first().click();
    await page.keyboard.type('/image');
    await page.keyboard.press('Enter');

    const picker = page.getByTestId('image-picker');
    await expect(picker).toBeVisible();

    const dropped = await picker.evaluate(async (element) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'dot.png', { type: 'image/png' }));

      element.dispatchEvent(
        new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const highlighted = element.hasAttribute('data-dragging');
      element.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );

      return highlighted;
    });

    expect(dropped).toBe(true);
    await expect(page.locator('[data-inkbrick-block="image"]')).toHaveCount(1);
    await expect(page.locator('[data-inkbrick-block="image"] img')).toHaveAttribute(
      'src',
      /^data:image\/png/,
    );
  });
});
