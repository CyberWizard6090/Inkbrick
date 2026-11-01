import { test, expect } from '@playwright/test';

test.describe('Document Editor E2E', () => {
  const paragraphSelector = '[data-inkbrick-block="paragraph"] .editable';
  const blockSelector = '.editable';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector(paragraphSelector);
  });

  test('Should insert text and split blocks on Enter', async ({ page }) => {
    const firstBlock = page.locator(paragraphSelector).first();
    await firstBlock.click();

    await page.keyboard.type('First line text');
    await expect(firstBlock).toHaveText('First line text');

    await page.keyboard.press('Enter');
    await page.keyboard.type('Second line text');

    await page.keyboard.press('Enter');
    await page.keyboard.type('5 минут полет нормальный');

    const blocks = page.locator(blockSelector);
    await expect(blocks).toHaveCount(3);
    await expect(blocks.nth(1)).toHaveText('Second line text');
  });

  test('Should merge blocks on Backspace', async ({ page }) => {
    const firstBlock = page.locator(paragraphSelector).first();
    await firstBlock.click();

    await page.keyboard.type('Line 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2');

    const blocks = page.locator(blockSelector);
    await expect(blocks).toHaveCount(2);

    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');

    await expect(blocks).toHaveCount(1);
    await expect(firstBlock).toHaveText('Line 1Line 2');
  });

  test('Should apply formatting shortcut', async ({ page }) => {
    const firstBlock = page.locator(paragraphSelector).first();
    await firstBlock.click();
    await page.keyboard.type('Make me bold');

    const isMac = await page.evaluate(() => navigator.userAgent.includes('Mac'));
    const modifier = isMac ? 'Meta' : 'Control';

    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+B`);

    const boldText = firstBlock.locator(
      'strong, b, [data-bold="true"], span[style*="font-weight"]',
    );
    await expect(boldText).toBeVisible();
    await expect(boldText).toHaveText('Make me bold');
  });

  test('Should partially delete text inside a block', async ({ page }) => {
    const firstBlock = page.locator(paragraphSelector).first();
    await firstBlock.click();

    await page.keyboard.type('Hello beautiful world!');

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Backspace');
    }
    await expect(firstBlock).toHaveText('Hello beautiful ');

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+ArrowLeft');
    }
    await page.keyboard.press('Backspace'); // Удаляем выделенное

    await expect(firstBlock).toHaveText('Hello ');
  });

  test('Should delete a middle row and verify all remaining blocks', async ({ page }) => {
    const firstBlock = page.locator(paragraphSelector).first();
    await firstBlock.click();

    const lines = ['Row 1', 'Row 2 (target)', 'Row 3', 'Row 4'];
    for (let i = 0; i < lines.length; i++) {
      await page.keyboard.type(lines[i]);
      if (i < lines.length - 1) {
        await page.keyboard.press('Enter');
      }
    }

    const blocks = page.locator(blockSelector);
    await expect(blocks).toHaveCount(4);

    await blocks.nth(1).click();
    await page.keyboard.press('End'); // Убеждаемся, что курсор в конце строки

    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Backspace');
    }

    await page.keyboard.press('Backspace');

    await expect(blocks).toHaveCount(3);

    await expect(blocks.nth(0)).toHaveText('Row 1');
    await expect(blocks.nth(1)).toHaveText('Row 3');
    await expect(blocks.nth(2)).toHaveText('Row 4');
  });

  test('Complex typing, deletion and block verification scenario', async ({ page }) => {
    const firstBlock = page.locator(paragraphSelector).first();
    await firstBlock.click();

    for (let i = 1; i <= 5; i++) {
      await page.keyboard.type(`Block number ${i}`);
      if (i < 5) await page.keyboard.press('Enter');
    }

    const blocks = page.locator(blockSelector);
    await expect(blocks).toHaveCount(5);

    await blocks.nth(3).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.press('Backspace'); // Текст удален
    await page.keyboard.press('Backspace'); // Блок удален/склеен

    await blocks.nth(1).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace'); // Удаляем только цифру "2", пробел остаётся
    await page.keyboard.type('UPDATED');

    await expect(blocks).toHaveCount(4);

    const expectedTexts = [
      'Block number 1',
      'Block number UPDATED', // Измененный 2-й блок
      'Block number 3',
      'Block number 5', // 5-й блок сместился на 4-е место
    ];

    for (let i = 0; i < expectedTexts.length; i++) {
      await expect(blocks.nth(i)).toHaveText(expectedTexts[i]);
    }
  });
});
