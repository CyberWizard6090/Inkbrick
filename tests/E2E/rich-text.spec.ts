import { test, expect, type Page } from '@playwright/test';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const toolbar = '[data-testid="toolbar"]';
const atom = '[data-inkbrick-formula]';
const popover = '[data-testid="formula-popover"]';

const rows = (page: Page) =>
  page.evaluate(() => {
    const snapshot = (window as any).__inkbrick.main.snapshot();
    const out: Array<{
      flavour: string;
      text: string;
      props: Record<string, any>;
      content: any[];
    }> = [];
    const walk = (id: string) => {
      const block = snapshot.blocks[id];

      if (block.flavour !== 'block:page' && block.flavour !== 'block:note') {
        out.push({
          flavour: block.flavour.replace('block:', ''),
          text: block.content.map((node: any) => node.insert).join(''),
          props: block.props,
          content: block.content,
        });
      }

      block.children.forEach(walk);
    };

    walk(snapshot.rootId);

    return out;
  });

async function typeLine(page: Page, text: string) {
  await page.locator('.editable').first().click();
  await page.keyboard.type(text);
}

async function selectLine(page: Page) {
  await page.keyboard.press('Shift+Home');
  await expect(page.locator(toolbar)).toBeVisible();
}

test.describe('Block formula', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('the slash menu inserts a formula block that opens for editing and renders MathML', async ({
    page,
  }) => {
    await typeLine(page, '/formula');
    await page.keyboard.press('Enter');

    const field = page.locator('[data-inkbrick-part="formula-source"]');

    await expect(field).toBeFocused();
    await field.fill('\\frac{a}{b} + \\sqrt{x}');
    await expect(page.locator('[data-inkbrick-part="formula-preview"] math')).toBeVisible();

    await page.keyboard.press(`${modifier}+Enter`);

    await expect(
      page.locator('[data-inkbrick-block="formula"] [data-inkbrick-part="formula-display"] math'),
    ).toBeVisible();
    expect((await rows(page)).find((row) => row.flavour === 'formula')!.props.latex).toBe(
      '\\frac{a}{b} + \\sqrt{x}',
    );
  });

  test('"$$ " at the start of a paragraph creates a formula block', async ({ page }) => {
    await typeLine(page, '$$ ');

    await expect(page.locator('[data-inkbrick-block="formula"]')).toHaveCount(1);
    await expect(page.locator('[data-inkbrick-part="formula-source"]')).toBeFocused();
  });

  test('clicking a rendered formula edits it; Escape cancels; the change is one undo step', async ({
    page,
  }) => {
    await typeLine(page, '$$ ');
    await page.locator('[data-inkbrick-part="formula-source"]').fill('a+b');
    await page.keyboard.press(`${modifier}+Enter`);

    await page.locator('[data-inkbrick-part="formula-display"]').click();
    await page.locator('[data-inkbrick-part="formula-source"]').fill('x');
    await page.keyboard.press('Escape');
    expect((await rows(page))[0].props.latex).toBe('a+b');

    await page.locator('[data-inkbrick-part="formula-display"]').click();
    await page.locator('[data-inkbrick-part="formula-source"]').fill('c^2');
    await page.locator('[data-inkbrick-part="formula-source"]').blur();
    expect((await rows(page))[0].props.latex).toBe('c^2');
  });

  test('a broken formula shows the error and keeps the source', async ({ page }) => {
    await typeLine(page, '$$ ');
    await page.locator('[data-inkbrick-part="formula-source"]').fill('\\frac{a');

    await expect(page.locator('[data-inkbrick-part="formula-error"]')).toBeVisible();
    await expect(page.locator('[data-inkbrick-part="formula-source"]')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('an empty formula block can be left and is shown as a prompt', async ({ page }) => {
    await typeLine(page, '$$ ');
    await page.keyboard.press('Escape');

    await expect(page.locator('[data-inkbrick-part="formula-empty"]')).toBeVisible();
  });
});

test.describe('Inline formula', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('typing $code$ converts to a formula and typing continues after it', async ({ page }) => {
    await typeLine(page, 'Energy $E=mc^2$ rocks');

    await expect(page.locator(atom)).toHaveCount(1);
    await expect(page.locator(atom)).toHaveAttribute('data-latex', 'E=mc^2');
    await expect(page.locator(`${atom}`)).toHaveJSProperty('isContentEditable', false);

    const [row] = await rows(page);

    expect(row.text).toBe('Energy ￼ rocks');
    expect(row.content.filter((node) => node.attributes?.formula)).toHaveLength(1);
  });

  test('the formula is rendered as MathML inside the object', async ({ page }) => {
    await typeLine(page, '$x^2$');

    await expect
      .poll(() =>
        page.locator(atom).evaluate((host) => host.shadowRoot?.querySelector('math') !== null),
      )
      .toBe(true);
  });

  test('prices and escaped dollars stay plain text', async ({ page }) => {
    await typeLine(page, 'It costs $5 and $6');

    await expect(page.locator(atom)).toHaveCount(0);
    expect((await rows(page))[0].text).toBe('It costs $5 and $6');
  });

  test('Backspace right after a formula removes it as one character', async ({ page }) => {
    await typeLine(page, 'a $x$');
    await expect(page.locator(atom)).toHaveCount(1);

    await page.keyboard.press('Backspace');

    await expect(page.locator(atom)).toHaveCount(0);
    expect((await rows(page))[0].text).toBe('a ');
  });

  test('arrow keys move over the formula in one step', async ({ page }) => {
    await typeLine(page, 'ab$x$cd');
    // Формула рисуется асинхронно (Temml подгружается); стрелки проверяем на отрисованной.
    await expect(page.locator(atom)).toHaveAttribute('data-state', 'ready');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('Z');

    expect((await rows(page))[0].text).toBe('ab￼Zcd');
  });

  test('Ctrl+Shift+M opens the popover; Enter inserts; undo removes in one step', async ({
    page,
  }) => {
    await typeLine(page, 'x ');
    await page.keyboard.press(`${modifier}+Shift+M`);

    const field = page.locator(`${popover} [data-inkbrick-part="formula-source"]`);

    await expect(field).toBeFocused();
    await field.fill('\\alpha+\\beta');
    await expect(page.locator(`${popover} math`)).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(page.locator(popover)).toHaveCount(0);
    await expect(page.locator(atom)).toHaveAttribute('data-latex', '\\alpha+\\beta');

    await page.keyboard.type('!');
    expect((await rows(page))[0].text).toBe('x ￼!');

    await page.keyboard.press(`${modifier}+Z`);
    await page.keyboard.press(`${modifier}+Z`);
    expect((await rows(page))[0].text).toBe('x ');
  });

  test('the popover keeps Apply disabled until there is code and Escape closes it', async ({
    page,
  }) => {
    await typeLine(page, 'x');
    await page.keyboard.press(`${modifier}+Shift+M`);

    await expect(page.locator(`${popover} [data-action="apply"]`)).toBeDisabled();
    await page.keyboard.press('Escape');

    await expect(page.locator(popover)).toHaveCount(0);
    await expect(page.locator(atom)).toHaveCount(0);
  });

  test('clicking a formula edits it, the remove button deletes it', async ({ page }) => {
    await typeLine(page, 'a$x$b');
    await page.locator(atom).click();

    const field = page.locator(`${popover} [data-inkbrick-part="formula-source"]`);

    await expect(field).toHaveValue('x');
    await field.fill('y^2');
    await page.keyboard.press('Enter');
    await expect(page.locator(atom)).toHaveAttribute('data-latex', 'y^2');

    await page.locator(atom).click();
    await page.locator(`${popover} [data-action="remove"]`).click();

    await expect(page.locator(atom)).toHaveCount(0);
    expect((await rows(page))[0].text).toBe('ab');
  });

  test('a selected text becomes the starting code of the formula (toolbar button)', async ({
    page,
  }) => {
    await typeLine(page, 'x+y');
    await selectLine(page);
    await page.locator(`${toolbar} [data-format="formula"]`).click();

    await expect(page.locator(`${popover} [data-inkbrick-part="formula-source"]`)).toHaveValue(
      'x+y',
    );
    await page.keyboard.press('Enter');

    await expect(page.locator(atom)).toHaveAttribute('data-latex', 'x+y');
    expect((await rows(page))[0].text).toBe('￼');
  });

  test('formulas are not editable in read-only mode', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const { editor } = (window as any).__inkbrick.main;
      const note = editor.document.getBlock(editor.document.rootId).children[0];
      const first = editor.document.getBlock(note).children[0];

      editor.dispatch({
        type: 'insertFormula',
        payload: { blockId: first, from: 0, to: 0, latex: 'q' },
      });
    });
    await page.getByTestId('mode-read').click();

    await expect(page.locator(atom)).toHaveCount(1);
    await page.locator(atom).click();
    await expect(page.locator(popover)).toHaveCount(0);
  });
});

test.describe('Text color and highlight', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('the toolbar colors the selection and the color is stored as a palette name', async ({
    page,
  }) => {
    await typeLine(page, 'colored');
    await selectLine(page);

    await page.locator(`${toolbar} [data-format="color"]`).click();
    await page
      .locator(`${toolbar} [data-inkbrick-part="panel"][data-kind="color"] [data-color="red"]`)
      .click();

    await expect(page.locator('[data-inkbrick-color="red"]')).toHaveText('colored');
    expect((await rows(page))[0].content).toEqual([
      { insert: 'colored', attributes: { color: 'red' } },
    ]);
    await expect(page.locator(`${toolbar} [data-inkbrick-part="panel"]`)).toHaveCount(0);
    await expect(page.locator(toolbar)).toBeVisible();
  });

  test('swatches show their colors (base swatch style must not override them)', async ({
    page,
  }) => {
    await typeLine(page, 'x');
    await selectLine(page);

    const style = (kind: string, color: string, prop: 'color' | 'backgroundColor') =>
      page
        .locator(
          `${toolbar} [data-inkbrick-part="panel"][data-kind="${kind}"] [data-color="${color}"]`,
        )
        .evaluate((el, p) => getComputedStyle(el)[p], prop);

    await page.locator(`${toolbar} [data-format="color"]`).click();
    expect(await style('color', 'red', 'color')).not.toBe(await style('color', '', 'color'));
    expect(await style('color', 'red', 'color')).not.toBe(await style('color', 'blue', 'color'));

    await page.locator(`${toolbar} [data-format="highlight"]`).click();
    const none = await style('highlight', '', 'backgroundColor');
    expect(await style('highlight', 'yellow', 'backgroundColor')).not.toBe(none);
    expect(await style('highlight', 'green', 'backgroundColor')).not.toBe(none);
  });

  test('the highlight (background) is separate from the text color', async ({ page }) => {
    await typeLine(page, 'marked');
    await selectLine(page);

    await page.locator(`${toolbar} [data-format="highlight"]`).click();
    await page
      .locator(
        `${toolbar} [data-inkbrick-part="panel"][data-kind="highlight"] [data-color="yellow"]`,
      )
      .click();

    await expect(page.locator('[data-inkbrick-bg="yellow"]')).toHaveText('marked');
    expect((await rows(page))[0].content[0].attributes).toEqual({ backgroundColor: 'yellow' });
  });

  test('both can be combined, the button shows the current color, reset removes it', async ({
    page,
  }) => {
    await typeLine(page, 'both');
    await selectLine(page);

    await page.locator(`${toolbar} [data-format="color"]`).click();
    await page.locator(`${toolbar} [data-inkbrick-part="panel"] [data-color="blue"]`).click();
    await page.locator(`${toolbar} [data-format="highlight"]`).click();
    await page.locator(`${toolbar} [data-inkbrick-part="panel"] [data-color="pink"]`).click();

    await expect(page.locator(`${toolbar} [data-format="color"]`)).toHaveAttribute(
      'data-current-color',
      'blue',
    );
    expect((await rows(page))[0].content[0].attributes).toEqual({
      color: 'blue',
      backgroundColor: 'pink',
    });

    await page.locator(`${toolbar} [data-format="color"]`).click();
    await page.locator(`${toolbar} [data-inkbrick-part="panel"] [data-color=""]`).click();

    expect((await rows(page))[0].content[0].attributes).toEqual({ backgroundColor: 'pink' });
  });

  test('colors follow the theme: the same name has different shades in light and dark', async ({
    page,
  }) => {
    await typeLine(page, 'tone');
    await selectLine(page);
    await page.locator(`${toolbar} [data-format="color"]`).click();
    await page.locator(`${toolbar} [data-inkbrick-part="panel"] [data-color="red"]`).click();

    const span = page.locator('[data-inkbrick-color="red"]');

    await page.evaluate(() =>
      document.documentElement.setAttribute('data-inkbrick-theme', 'light'),
    );
    await expect(span).toHaveCSS('color', 'rgb(229, 25, 43)');

    await page.evaluate(() => document.documentElement.setAttribute('data-inkbrick-theme', 'dark'));
    await expect(span).toHaveCSS('color', 'rgb(255, 90, 103)');
  });

  test('the color is one undo step and typing after colored text keeps the color', async ({
    page,
  }) => {
    await typeLine(page, 'ab');
    await selectLine(page);
    await page.locator(`${toolbar} [data-format="color"]`).click();
    await page.locator(`${toolbar} [data-inkbrick-part="panel"] [data-color="green"]`).click();

    await page.keyboard.press('End');
    await page.keyboard.type('c');
    expect((await rows(page))[0].content).toEqual([
      { insert: 'abc', attributes: { color: 'green' } },
    ]);

    await page.keyboard.press(`${modifier}+Z`);
    await page.keyboard.press(`${modifier}+Z`);
    expect((await rows(page))[0].content).toEqual([{ insert: 'ab' }]);
  });

  test('the panel is hidden together with the toolbar', async ({ page }) => {
    await typeLine(page, 'z');
    await selectLine(page);
    await page.locator(`${toolbar} [data-format="color"]`).click();
    await expect(page.locator(`${toolbar} [data-inkbrick-part="panel"]`)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.locator(toolbar)).toHaveCount(0);
  });
});

test.describe('Text alignment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('toolbar buttons align the block and show the current alignment', async ({ page }) => {
    await typeLine(page, 'centered');
    await selectLine(page);
    await page.locator(`${toolbar} [data-format="align-center"]`).click();

    await expect(page.locator('[data-inkbrick-block="paragraph"]')).toHaveAttribute(
      'data-align',
      'center',
    );
    await expect(page.locator(`${toolbar} [data-format="align-center"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.locator('[data-inkbrick-block="paragraph"] [data-inkbrick-part="content"]'),
    ).toHaveCSS('text-align', 'center');
    expect((await rows(page))[0].props.alignment).toBe('center');
  });

  test('keyboard shortcuts Ctrl+Shift+L/E/R/J work without a selection', async ({ page }) => {
    await typeLine(page, 'text');

    for (const [key, align] of [
      ['E', 'center'],
      ['R', 'right'],
      ['J', 'justify'],
      ['L', 'left'],
    ] as const) {
      await page.keyboard.press(`${modifier}+Shift+${key}`);
      await expect(page.locator('[data-inkbrick-block="paragraph"]')).toHaveAttribute(
        'data-align',
        align,
      );
    }
  });

  test('aligns all selected blocks in one undo step; code blocks are skipped', async ({ page }) => {
    await typeLine(page, 'one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('``` ');
    await page.keyboard.type('code');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await page.keyboard.type('three');
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+Shift+E`);

    const result = await rows(page);

    expect(
      result
        .filter((row) => row.flavour === 'paragraph')
        .every((row) => row.props.alignment === 'center'),
    ).toBe(true);
    expect(result.find((row) => row.flavour === 'code')!.props.alignment).toBeUndefined();

    await page.keyboard.press(`${modifier}+Z`);
    expect(
      (await rows(page))
        .filter((row) => row.flavour === 'paragraph')
        .every((row) => row.props.alignment === 'left'),
    ).toBe(true);
  });

  test('works for headings, quotes, list items and callouts too', async ({ page }) => {
    for (const [shortcut, flavour] of [
      ['# ', 'heading'],
      ['> ', 'quote'],
      ['- ', 'list'],
    ] as const) {
      await page.goto('/?lang=en');
      await page.locator('.editable').first().click();
      await page.keyboard.type(`${shortcut}text`);
      await page.keyboard.press(`${modifier}+Shift+R`);

      await expect(
        page.locator(`[data-inkbrick-block="${flavour}"]`).first(),
        flavour,
      ).toHaveAttribute('data-align', 'right');
      await expect(
        page.locator(`[data-inkbrick-block="${flavour}"] [data-inkbrick-part="content"]`).first(),
        flavour,
      ).toHaveCSS('text-align', 'right');
    }
  });

  test('a nested list item keeps its own alignment', async ({ page }) => {
    await typeLine(page, '- parent');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('child');
    await page.keyboard.press(`${modifier}+Shift+E`);

    const aligns = await page
      .locator('[data-inkbrick-block="list"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-align')));

    expect(aligns).toEqual(['left', 'center']);
  });
});

test.describe('Rich text: localization', () => {
  test('toolbar labels follow the language', async ({ page }) => {
    await page.goto('/?lang=ru');
    await typeLine(page, 'привет');
    await selectLine(page);

    await expect(page.locator(`${toolbar} [data-format="formula"]`)).toHaveAttribute(
      'aria-label',
      'Формула',
    );
    await expect(page.locator(`${toolbar} [data-format="align-center"]`)).toHaveAttribute(
      'aria-label',
      'По центру',
    );

    await page.locator(`${toolbar} [data-format="color"]`).click();
    await expect(page.locator(`${toolbar} [data-color="red"]`)).toHaveAttribute(
      'aria-label',
      'Красный',
    );
  });
});

test.describe('Math symbol palette', () => {
  // Кнопки палитры именуются кодом LaTeX (aria-label), поэтому ищем по доступному имени.
  const symbol = (page: Page, code: string, scope = '') =>
    page
      .locator(`${scope} [data-inkbrick-part="formula-symbol"]`.trim())
      .and(page.getByRole('button', { name: code, exact: true }));
  const field = (page: Page) =>
    page.locator('[data-inkbrick-block="formula"] [data-inkbrick-part="formula-source"]');

  test.beforeEach(async ({ page }) => {
    await page.goto('/?lang=en');
  });

  test('block editor: sin inserts \\sin() with the caret inside the brackets', async ({ page }) => {
    await typeLine(page, '$$ ');

    await symbol(page, '\\sin()').click();
    await page.keyboard.type('x');

    await expect(field(page)).toHaveValue('\\sin(x)');
    await expect(field(page)).toBeFocused();
    await expect(page.locator('[data-inkbrick-part="formula-preview"] math')).toBeVisible();
  });

  test('tabs switch the category; Greek letters and structures insert their code', async ({
    page,
  }) => {
    await typeLine(page, '$$ ');

    await page.locator('[data-category="greek"]').click();
    await symbol(page, '\\alpha').click();
    await symbol(page, '\\pi').click();
    await expect(field(page)).toHaveValue('\\alpha \\pi ');

    await page.locator('[data-category="structures"]').click();
    await symbol(page, '\\sum_{i=1}^{n}').click();
    await expect(field(page)).toHaveValue('\\alpha \\pi \\sum_{i=1}^{n} ');
  });

  test('the selected code is wrapped by a template', async ({ page }) => {
    await typeLine(page, '$$ ');
    await field(page).fill('a+b');
    await field(page).selectText();
    await page.locator('[data-category="structures"]').click();
    await symbol(page, '\\sqrt{}').click();

    await expect(field(page)).toHaveValue('\\sqrt{a+b}');
  });

  test('using the palette never commits or closes the block editor; Ctrl+Enter then applies', async ({
    page,
  }) => {
    await typeLine(page, '$$ ');
    await symbol(page, '\\sin()').click();
    await page.keyboard.type('x');

    expect((await rows(page))[0].props.latex).toBe('');
    await expect(field(page)).toBeVisible();

    await page.keyboard.press(`${modifier}+Enter`);

    expect((await rows(page))[0].props.latex).toBe('\\sin(x)');
    await expect(page.locator('[data-inkbrick-part="formula-display"] math')).toBeVisible();
  });

  test('inline popover has the palette too, and Apply inserts the built formula', async ({
    page,
  }) => {
    await typeLine(page, 'f = ');
    await page.keyboard.press(`${modifier}+Shift+M`);

    const source = page.locator(`${popover} [data-inkbrick-part="formula-source"]`);

    await page.locator(`${popover} [data-category="greek"]`).click();
    await symbol(page, '\\theta', popover).click();
    await expect(source).toHaveValue('\\theta ');
    await expect(source).toBeFocused();

    await page.locator(`${popover} [data-action="apply"]`).click();

    await expect(page.locator(atom)).toHaveAttribute('data-latex', '\\theta');
  });

  test('keyboard users can reach the palette: the block editor stays open', async ({ page }) => {
    await typeLine(page, '$$ ');
    await page.keyboard.press('Tab');

    await expect(page.locator('[data-inkbrick-part="formula-palette-tab"]').first()).toBeFocused();
    await expect(field(page)).toBeVisible();
  });

  test('palette names are translated; tooltips show the LaTeX code', async ({ page }) => {
    await page.goto('/?lang=ru');
    await typeLine(page, '$$ ');

    await expect(page.locator('[data-inkbrick-part="formula-palette"]')).toHaveAttribute(
      'aria-label',
      'Математические символы',
    );
    await expect(page.locator('[data-category="greek"]')).toHaveAttribute(
      'title',
      'Греческие буквы',
    );
    await expect(symbol(page, '\\sin()')).toHaveAttribute('title', '\\sin()');
  });
});
