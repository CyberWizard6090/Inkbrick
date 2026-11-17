import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const ref = '[data-inkbrick-footnote]';
const footnote = '[data-inkbrick-block="footnote"]';

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press('Delete');

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

const labels = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-inkbrick-footnote]')].map(
      (host) => host.shadowRoot!.querySelector('sup')!.textContent,
    ),
  );

test.describe('Footnotes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
    await typeBlocks(page, ['Water boils']);
  });

  test('/footnote adds a numbered reference and a text field at the end of the document', async ({
    page,
  }) => {
    await page.keyboard.type(' /footnote');
    await page.keyboard.press('Enter');

    await expect(page.locator(ref)).toHaveCount(1);
    await expect.poll(() => labels(page)).toEqual(['1']);
    await expect(page.locator(footnote)).toHaveCount(1);

    // Каретка уже в тексте сноски.
    await page.keyboard.type('At sea level.');
    await expect(page.locator(`${footnote} ${editable}`)).toHaveText('At sea level.');
    await expect(page.locator(`${footnote} [data-inkbrick-part="footnote-number"]`)).toHaveText(
      '1',
    );

    // Текст исходного блока не изменился.
    await expect(page.locator(editable).first()).toHaveText(/^Water boils/);
  });

  test('a click on the number goes to the text, "back" returns next to the reference', async ({
    page,
  }) => {
    await page.keyboard.type(' /footnote');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Note');

    await page
      .locator(editable)
      .first()
      .click({ position: { x: 5, y: 5 } });
    await page.locator(ref).click();
    await page.keyboard.type('!');
    await expect(page.locator(`${footnote} ${editable}`)).toHaveText('Note!');

    await page.locator('[data-inkbrick-part="footnote-back"]').click();
    await page.keyboard.type('?');
    await expect(page.locator(editable).first()).toContainText('?');
    await expect(page.locator(`${footnote} ${editable}`)).toHaveText('Note!');
  });

  test('numbers follow the reading order and a deleted reference leaves "?"', async ({ page }) => {
    await page.keyboard.type(' /footnote');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second');

    // Ссылка в тексте выше первой: у прежней номер 2.
    await page.locator(editable).first().click();
    await page.keyboard.press('Home');
    await page.keyboard.type('Intro /footnote');
    await page.keyboard.press('Enter');
    await page.keyboard.type('First');

    await expect.poll(() => labels(page)).toEqual(['1', '2']);
    await expect(page.locator(`${footnote} [data-inkbrick-part="footnote-number"]`)).toHaveText([
      '1',
      '2',
    ]);

    // Удаляем первую ссылку («Intro » и сам символ-объект): текст сноски остаётся без ссылки.
    await page.locator(editable).first().click();
    await page.keyboard.press('Home');
    for (let i = 0; i < 'Intro '.length; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');
    await expect(page.locator(ref)).toHaveCount(1);
    await expect(page.locator(`${footnote}[data-orphan]`)).toHaveCount(1);
    await expect(
      page.locator(`${footnote}[data-orphan] [data-inkbrick-part="footnote-number"]`),
    ).toHaveText('?');
  });

  test('undo takes back the reference and the text together', async ({ page }) => {
    await page.keyboard.type(' /footnote');
    await page.keyboard.press('Enter');
    await expect(page.locator(footnote)).toHaveCount(1);

    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator(footnote)).toHaveCount(0);
    await expect(page.locator(ref)).toHaveCount(0);
  });
});
