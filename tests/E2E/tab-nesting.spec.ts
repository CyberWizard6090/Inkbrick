import { test, expect, type Page } from '@playwright/test';

const editable = '.editable';

const tree = (page: Page) =>
  page.evaluate(() => {
    const snap = (window as any).__inkbrick.main.snapshot();
    const out: string[] = [];
    const walk = (id: string, depth: number) => {
      const block = snap.blocks[id];
      const container = block.flavour === 'block:page' || block.flavour === 'block:note';

      if (!container) {
        out.push(
          `${'  '.repeat(depth)}${block.flavour.replace('block:', '')}:${block.content.map((n: any) => n.insert).join('')}`,
        );
      }
      block.children.forEach((child: string) => walk(child, container ? depth : depth + 1));
    };
    walk(snap.rootId, 0);
    return out;
  });

test.describe('Tab, nesting and leaving lists', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('Tab in a paragraph keeps focus in the editor and never nests it into a list', async ({
    page,
  }) => {
    await page.keyboard.type('- item');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // пустой пункт → параграф
    await page.keyboard.type('para');

    await page.keyboard.press('Tab');
    await page.keyboard.type('!');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('?');

    expect(await tree(page)).toEqual(['list:item', 'paragraph:para!?']);
  });

  test('Tab on the first list item does nothing and keeps focus', async ({ page }) => {
    await page.keyboard.type('- a');
    await page.keyboard.press('Tab');
    await page.keyboard.type('b');

    expect(await tree(page)).toEqual(['list:ab']);
  });

  test('Enter in an empty nested item lifts it one level, then leaves the list; no paragraphs pile up inside', async ({
    page,
  }) => {
    await page.keyboard.type('- a');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('b');
    await page.keyboard.press('Enter');
    expect(await tree(page)).toEqual(['list:a', '  list:b', '  list:']);

    await page.keyboard.press('Enter'); // пустой вложенный → на уровень выше
    expect(await tree(page)).toEqual(['list:a', '  list:b', 'list:']);

    await page.keyboard.press('Enter'); // пустой верхнего уровня → параграф
    expect(await tree(page)).toEqual(['list:a', '  list:b', 'paragraph:']);

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect((await tree(page)).filter((line) => line.startsWith('  paragraph'))).toEqual([]);
  });

  test('Backspace at the start of a nested item steps out: lift → paragraph → merge', async ({
    page,
  }) => {
    await page.keyboard.type('- a');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('b');
    await page.keyboard.press('Home');

    await page.keyboard.press('Backspace');
    expect(await tree(page)).toEqual(['list:a', 'list:b']);

    await page.keyboard.press('Backspace');
    expect(await tree(page)).toEqual(['list:a', 'paragraph:b']);

    await page.keyboard.press('Backspace');
    expect(await tree(page)).toEqual(['list:ab']);
  });

  test('Shift+Tab keeps the reading order: later siblings become children of the lifted item', async ({
    page,
  }) => {
    await page.keyboard.type('- a');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('b');
    await page.keyboard.press('Enter');
    await page.keyboard.type('c');
    await page.keyboard.press('Enter');
    await page.keyboard.type('d');
    expect(await tree(page)).toEqual(['list:a', '  list:b', '  list:c', '  list:d']);

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+Tab'); // поднимаем «c»

    expect(await tree(page)).toEqual(['list:a', '  list:b', 'list:c', '  list:d']);
    expect(await page.locator(editable).allTextContents()).toEqual(['a', 'b', 'c', 'd']);
  });

  test('lifting and indenting can be undone', async ({ page }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

    await page.keyboard.type('- a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    await page.keyboard.press('Tab');
    expect(await tree(page)).toEqual(['list:a', '  list:b']);

    await page.keyboard.press(`${modifier}+Z`);
    expect(await tree(page)).toEqual(['list:a', 'list:b']);
  });
});
