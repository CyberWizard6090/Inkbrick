import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const fold =
  '[data-inkbrick-block="list"][data-foldable] > [data-inkbrick-part="row"] > [data-inkbrick-part="fold"]';

async function nestedList(page: Page) {
  await page.goto('/?lang=en');
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

test.describe('List item folding', () => {
  test('the arrow hides the nested items and shows them again; undo restores', async ({ page }) => {
    await nestedList(page);

    await expect(page.locator(editable)).toHaveText(['parent', 'child one', 'child two']);
    await expect(page.locator(fold)).toHaveCount(1);

    await page.locator(fold).click();

    await expect(page.locator(editable)).toHaveText(['parent']);
    await expect(page.locator(fold)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(fold)).toBeVisible();

    await page.locator(fold).click();
    await expect(page.locator(editable)).toHaveText(['parent', 'child one', 'child two']);

    await page.locator(fold).click();
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(editable)).toHaveText(['parent', 'child one', 'child two']);
  });

  test('Ctrl+Enter on the item folds it, and the caret that was inside goes to the item', async ({
    page,
  }) => {
    await nestedList(page);

    // Каретка во вложенном «child two»: сворачиваем стрелкой — каретка уходит на «parent».
    await page.locator(fold).click();
    await expect(page.locator(editable)).toHaveText(['parent']);
    await page.keyboard.type('!');
    await expect(page.locator(editable)).toHaveText(['parent!']);

    await page.keyboard.press(`${modifier}+Enter`);
    await expect(page.locator(editable)).toHaveText(['parent!', 'child one', 'child two']);
  });

  test('Tab into a collapsed item expands it: the block is not lost', async ({ page }) => {
    await nestedList(page);
    await page.locator(fold).click();

    await page.locator(editable).first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('sibling');
    await page.keyboard.press('Tab');

    await expect(page.locator(editable)).toHaveText([
      'parent',
      'child one',
      'child two',
      'sibling',
    ]);
    await expect(page.locator(fold)).toHaveAttribute('aria-expanded', 'true');
  });

  test('read mode: the reader can fold without changing the document', async ({ page }) => {
    await nestedList(page);
    await page.getByTestId('mode-read').click();

    await page.locator(fold).click();
    await expect(page.locator(editable)).toHaveText(['parent']);

    await page.getByTestId('mode-edit').click();
    const collapsed = await page.evaluate(() => {
      const { editor } = window.__inkbrick!.main;

      return Object.values(editor.document.dump()).some((block) => block.props.collapsed === true);
    });

    expect(collapsed).toBe(false);
  });
});
