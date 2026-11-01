import { test, expect, type Page } from '@playwright/test';

import { useTool, useSystemClipboard } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const FRAGMENT_MIME = 'application/x-inkbrick-fragment';

interface Row {
  depth: number;
  flavour: string;
  text: string;
  content: Array<{ insert: string; attributes?: Record<string, unknown> }>;
  props: Record<string, unknown>;
}

const doc = (page: Page, name = 'main') =>
  page.evaluate((n) => {
    const snap = (window as any).__inkbrick[n].snapshot();
    const rows: Row[] = [];
    const walk = (id: string, depth: number) => {
      const block = snap.blocks[id];
      const container = block.flavour === 'block:page' || block.flavour === 'block:note';

      if (!container) {
        rows.push({
          depth,
          flavour: block.flavour.replace('block:', ''),
          text: block.content.map((c: any) => c.insert).join(''),
          content: block.content,
          props: block.props,
        });
      }
      block.children.forEach((child: string) => walk(child, container ? depth : depth + 1));
    };
    walk(snap.rootId, 0);
    return rows;
  }, name);

const outline = async (page: Page, name?: string) =>
  (await doc(page, name)).map((r) => `${'  '.repeat(r.depth)}${r.flavour}:${r.text}`);

async function pasteData(
  page: Page,
  data: { html?: string; text?: string; fragment?: unknown; rawFragment?: string },
) {
  await page.evaluate(
    ([payload, mime]) => {
      const dt = new DataTransfer();

      if (payload.html !== undefined) dt.setData('text/html', payload.html);
      if (payload.text !== undefined) dt.setData('text/plain', payload.text);
      if (payload.rawFragment !== undefined) dt.setData(mime, payload.rawFragment);
      else if (payload.fragment !== undefined) dt.setData(mime, JSON.stringify(payload.fragment));

      const root = document.querySelector('.inkbrick-editor') as HTMLElement;
      root.focus();
      root.dispatchEvent(
        Object.defineProperty(
          new Event('paste', { bubbles: true, cancelable: true }),
          'clipboardData',
          { value: dt },
        ),
      );
    },
    [data, FRAGMENT_MIME] as const,
  );
}

const parse = (page: Page, html: string) =>
  page.evaluate((h) => (window as any).__inkbrickClipboard.htmlToFragment(h), html);

async function writeClipboard(page: Page, html: string, text: string) {
  await page.evaluate(
    async ([h, t]) => {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([h], { type: 'text/html' }),
          'text/plain': new Blob([t], { type: 'text/plain' }),
        }),
      ]);
    },
    [html, text] as const,
  );
}

const readClipboard = (page: Page) =>
  page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const read = async (type: string) =>
      item.types.includes(type) ? await (await item.getType(type)).text() : null;

    return { html: await read('text/html'), text: await read('text/plain') };
  });

async function typeBlocks(page: Page, texts: string[]) {
  await page.locator(editable).first().click();

  for (const [i, text] of texts.entries()) {
    await page.keyboard.type(text);
    if (i < texts.length - 1) await page.keyboard.press('Enter');
  }
}

test.describe('Copy', () => {
  test.beforeEach(async ({ page, context }) => {
    await useSystemClipboard(context);
    await page.goto('/');
  });

  test('puts formatted HTML and plain text on the clipboard', async ({ page }) => {
    await typeBlocks(page, ['# Title', 'plain bold']);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press(`${modifier}+B`);
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+C`);

    const { html, text } = await readClipboard(page);

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('contenteditable');
    expect(html).not.toContain('data-id');
    expect(text).toBe('Title\nplain bold');
  });

  test('copy then paste reproduces block types, nesting and formatting (exact fragment)', async ({
    page,
  }) => {
    await typeBlocks(page, ['## Head', '- one', 'two']);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.press(`${modifier}+I`);
    await page.keyboard.press('End');

    const before = await outline(page);
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+C`);
    await page.keyboard.press('ArrowRight'); // каретка в конец документа
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // пустой пункт → параграф
    await page.keyboard.press(`${modifier}+V`);

    const rows = await doc(page);
    const copy = rows.slice(before.length);

    expect(before).toEqual(['heading:Head', 'list:one', '  list:two']);
    expect(copy.map((r) => `${r.depth}:${r.flavour}:${r.text}`)).toEqual([
      '0:heading:Head',
      '0:list:one',
      '1:list:two',
    ]);
    expect(copy[0].props).toMatchObject({ level: 2 });
    expect(copy[2].content).toEqual([{ insert: 'two', attributes: { italic: true } }]);
  });

  test('cut removes the selection, paste restores it elsewhere, and both are undoable', async ({
    page,
  }) => {
    await typeBlocks(page, ['alpha', 'beta', 'gamma']);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.press(`${modifier}+X`);
    expect(await outline(page)).toEqual(['paragraph:alpha', 'paragraph:', 'paragraph:gamma']);

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press(`${modifier}+V`);
    expect(await outline(page)).toEqual(['paragraph:alpha', 'paragraph:', 'paragraph:gammabeta']);

    await page.keyboard.press(`${modifier}+Z`);
    expect(await outline(page)).toEqual(['paragraph:alpha', 'paragraph:', 'paragraph:gamma']);
    await page.keyboard.press(`${modifier}+Z`);
    expect(await outline(page)).toEqual(['paragraph:alpha', 'paragraph:beta', 'paragraph:gamma']);
  });
});

test.describe('Paste: rich HTML', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('Google Docs markup: wrapper, style-based bold/italic, headings, lists', async ({
    page,
  }) => {
    await pasteData(page, {
      html: `<meta charset='utf-8'><b style="font-weight:normal;" id="docs-internal-guid-1"><h2 dir="ltr"><span style="font-size:16pt;font-weight:700">Report</span></h2>
        <p dir="ltr" style="line-height:1.38"><span style="font-weight:700">Bold</span><span style="font-weight:400"> and </span><span style="font-style:italic;text-decoration:underline">fancy</span></p>
        <ul><li dir="ltr"><p dir="ltr"><span>first</span></p></li><ul><li dir="ltr"><p><span>nested</span></p></li></ul><li><p><span>second</span></p></li></ul></b>`,
      text: 'fallback',
    });

    expect(await outline(page)).toEqual([
      'heading:Report',
      'paragraph:Bold and fancy',
      'list:first',
      '  list:nested',
      'list:second',
    ]);

    const rows = await doc(page);
    expect(rows[0].props).toMatchObject({ level: 2 });
    expect(rows[1].content).toEqual([
      { insert: 'Bold', attributes: { bold: true } },
      { insert: ' and ' },
      { insert: 'fancy', attributes: { italic: true, underline: true } },
    ]);
  });

  test('Word markup: list paragraphs with mso-list levels, ordered markers, conditional comments', async ({
    page,
  }) => {
    await pasteData(page, {
      html: `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>
        <p class=MsoNormal>Intro<o:p></o:p></p>
        <p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;&nbsp;</span></span><![endif]>Step one<o:p></o:p></p>
        <p class=MsoListParagraphCxSpMiddle style='mso-list:l0 level2 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>a.<span>&nbsp;</span></span><![endif]>Sub step<o:p></o:p></p>
        <p class=MsoListParagraphCxSpLast style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>2.<span>&nbsp;</span></span><![endif]>Step two<o:p></o:p></p>
        <p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>·<span>&nbsp;</span></span><![endif]>Bullet</p>
      </body></html>`,
    });

    expect(await outline(page)).toEqual([
      'paragraph:Intro',
      'list:Step one',
      '  list:Sub step',
      'list:Step two',
      'list:Bullet',
    ]);

    const rows = await doc(page);
    expect(rows.slice(1).map((r) => r.props.type)).toEqual([
      'ordered',
      'ordered',
      'ordered',
      'bullet',
    ]);
  });

  test('keeps safe links and formatting, drops unsafe links, and never executes anything', async ({
    page,
  }) => {
    await pasteData(page, {
      html: `<p>see <a href="example.com/x">docs</a>, <a href="javascript:window.__pwned=1">bad</a> and <a href="https://ok.test/?a=1&b=2"><b>safe</b></a>
        <img src="x" onerror="window.__pwned=1"><script>window.__pwned=1</script><style>p{display:none}</style></p>`,
    });

    const [row] = await doc(page);

    expect(row.text).toBe('see docs, bad and safe');
    expect(
      row.content.filter((c) => c.attributes?.link).map((c) => [c.insert, c.attributes!.link]),
    ).toEqual([
      ['docs', 'https://example.com/x'],
      ['safe', 'https://ok.test/?a=1&b=2'],
    ]);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    await expect(
      page.locator('.inkbrick-editor img, .inkbrick-editor script, .inkbrick-editor style'),
    ).toHaveCount(0);
  });

  test('paste into an empty paragraph adopts a heading; into a non-empty one only merges text', async ({
    page,
  }) => {
    await pasteData(page, { html: '<h3>Section</h3><p>text</p>' });
    expect(await outline(page)).toEqual(['heading:Section', 'paragraph:text']);

    await page.keyboard.press('Enter');
    await page.keyboard.type('keep');
    await pasteData(page, { html: '<h1>X</h1>' });
    expect((await outline(page)).slice(-1)).toEqual(['paragraph:keepX']);
  });

  test('an exact Inkbrick fragment is preferred over HTML and plain text', async ({ page }) => {
    await pasteData(page, {
      fragment: {
        blocks: [
          {
            flavour: 'block:quote',
            props: {},
            content: [{ insert: 'exact' }],
            children: [],
            complete: true,
          },
        ],
      },
      html: '<p>from html</p>',
      text: 'from text',
    });

    expect(await outline(page)).toEqual(['quote:exact']);
  });

  test('unknown block types in a fragment degrade to paragraphs; hostile or broken fragments are ignored', async ({
    page,
  }) => {
    await pasteData(page, {
      fragment: {
        blocks: [
          {
            flavour: 'block:from-elsewhere',
            props: { z: 1 },
            content: [{ insert: 'kept' }],
            children: [],
            complete: true,
          },
        ],
      },
    });
    expect(await outline(page)).toEqual(['paragraph:kept']);

    await page.keyboard.press('Enter');
    await pasteData(page, { rawFragment: '{not json', text: 'fallback text' });
    await pasteData(page, {
      fragment: {
        blocks: [
          {
            flavour: 'block:paragraph',
            props: {},
            content: [{ insert: 'x', attributes: { link: 'javascript:window.__pwned=1' } }],
            children: [],
          },
        ],
      },
    });

    expect((await outline(page)).slice(1)).toEqual(['paragraph:fallback textx']);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    await expect(page.locator('.editable a')).toHaveCount(0);
  });

  test('a rich paste is one undo step', async ({ page }) => {
    await page.keyboard.type('ab');
    await page.keyboard.press('ArrowLeft');
    await pasteData(page, { html: '<h2>H</h2><p><b>bold</b></p><ul><li>item</li></ul>' });
    expect((await outline(page)).length).toBeGreaterThan(2);

    await page.keyboard.press(`${modifier}+Z`);

    expect(await outline(page)).toEqual(['paragraph:ab']);
  });

  test('pasting over a multi-block selection replaces it with the pasted blocks', async ({
    page,
  }) => {
    await typeBlocks(page, ['one', 'two', 'three']);
    await page.keyboard.press(`${modifier}+A`);
    await pasteData(page, { html: '<h2>New</h2><p>content</p>' });

    expect(await outline(page)).toEqual(['heading:New', 'paragraph:content']);
  });

  test('images and files alone are ignored', async ({ page }) => {
    await page.keyboard.type('keep');
    await pasteData(page, { html: '<img src="data:image/png;base64,AAAA">' });
    await pasteData(page, {});

    expect(await outline(page)).toEqual(['paragraph:keep']);
  });
});

test.describe('Paste: code, URLs and plain text', () => {
  test.beforeEach(async ({ page, context }) => {
    await useSystemClipboard(context);
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('inside a code block only plain text is inserted', async ({ page }) => {
    await page.keyboard.type('``` ');
    await pasteData(page, {
      html: '<p><b>bold</b> and <a href="https://x.test">link</a></p><p>second</p>',
      text: 'bold and link\nsecond',
    });

    const [code] = await doc(page);

    expect(code.flavour).toBe('code');
    expect(code.text).toBe('bold and link\nsecond');
    expect(code.content.every((c) => !c.attributes)).toBe(true);
  });

  test('code with blank lines stays inside the code block (no Enter-twice exit)', async ({
    page,
  }) => {
    await page.keyboard.type('``` ');
    const code = 'def f():\n\n    return 1\n\n\nprint(f())';

    await pasteData(page, { text: code });

    const rows = await doc(page);

    expect(rows.map((row) => row.flavour)).toEqual(['code']);
    expect(rows[0].text).toBe(code);
  });

  test('a URL pasted over selected text turns it into a link; over a caret it is inserted as text', async ({
    page,
  }) => {
    await page.keyboard.type('read the docs');
    await page.keyboard.press('Shift+ArrowLeft');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft'); // «docs»
    await pasteData(page, { text: 'https://example.com/docs' });

    expect((await doc(page))[0].content.filter((c) => c.attributes?.link)).toEqual([
      { insert: 'docs', attributes: { link: 'https://example.com/docs' } },
    ]);
    expect((await doc(page))[0].text).toBe('read the docs');

    await page.keyboard.press('End');
    await page.keyboard.type(' ');
    await pasteData(page, { text: 'https://example.com' });
    expect((await doc(page))[0].text).toBe('read the docs https://example.com');
  });

  test('Ctrl/Cmd+V pastes formatting from another app; Ctrl/Cmd+Shift+V pastes only text', async ({
    page,
  }) => {
    await writeClipboard(page, '<p>say <b>hello</b></p>', 'say hello');

    await page.keyboard.press(`${modifier}+V`);
    expect((await doc(page))[0].content).toEqual([
      { insert: 'say ' },
      { insert: 'hello', attributes: { bold: true } },
    ]);

    await page.keyboard.press('Enter');
    await page.keyboard.press(`${modifier}+Shift+V`);
    const rows = await doc(page);

    expect(rows[1].text).toBe('say hello');
    expect(rows[1].content).toEqual([{ insert: 'say hello' }]);
  });

  test('plain multi-line text still becomes one block per line, in one undo step', async ({
    page,
  }) => {
    await pasteData(page, { text: 'one\r\ntwo\nthree' });
    expect(await outline(page)).toEqual(['paragraph:one', 'paragraph:two', 'paragraph:three']);

    await page.keyboard.press(`${modifier}+Z`);
    expect(await outline(page)).toEqual(['paragraph:']);
  });
});

test.describe('HTML parser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  const outlineOf = (fragment: any): string[] => {
    const lines: string[] = [];
    const walk = (b: any, d: number) => {
      lines.push(
        `${'  '.repeat(d)}${b.flavour.replace('block:', '')}:${b.content.map((c: any) => c.insert).join('')}`,
      );
      b.children.forEach((c: any) => walk(c, d + 1));
    };
    fragment?.blocks.forEach((b: any) => walk(b, 0));
    return lines;
  };

  test('structure: headings, quotes, code, dividers, tables, todo, nested and malformed lists', async ({
    page,
  }) => {
    const fragment = await parse(
      page,
      `<h1>T</h1><blockquote><p>q1</p><p>q2</p></blockquote><blockquote>plain quote</blockquote>
       <pre><code class="language-ts">let a = 1;
let b = 2;
</code></pre><hr>
       <table><tr><th>a</th><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>
       <ul><li><input type="checkbox" checked> done</li><li>open<ol><li>x</li></ol></li></ul>`,
    );

    expect(outlineOf(fragment)).toEqual([
      'heading:T',
      'quote:q1',
      'quote:q2',
      'quote:plain quote',
      'code:let a = 1;\nlet b = 2;',
      'divider:',
      'paragraph:a\tb',
      'paragraph:c\td',
      'list:done',
      'list:open',
      '  list:x',
    ]);
    expect(fragment.blocks[4].props).toEqual({ language: 'ts' });
    expect(fragment.blocks[8].props).toEqual({ type: 'todo', checked: true });
    expect(fragment.blocks[9].children[0].props).toEqual({ type: 'ordered' });
  });

  test('whitespace: collapses runs, handles nbsp and <br>, trims block edges, drops empty blocks', async ({
    page,
  }) => {
    const fragment = await parse(
      page,
      '<p>  a   b\n  c&nbsp;d <b> e </b>  f  </p><p> </p><p><br></p><div>x<br>y</div><div>line<br></div>',
    );

    expect(outlineOf(fragment)).toEqual([
      'paragraph:a b c d e f',
      'paragraph:x\ny',
      'paragraph:line',
    ]);
  });

  test('plain inline content, top-level text and unknown containers become paragraphs', async ({
    page,
  }) => {
    const fragment = await parse(
      page,
      'loose <b>bold</b> text<custom-tag>widget</custom-tag><section><p>in section</p></section><span>tail</span>',
    );

    expect(outlineOf(fragment)).toEqual([
      'paragraph:loose bold textwidget',
      'paragraph:in section',
      'paragraph:tail',
    ]);
  });

  test('hidden content, scripts, styles, images, forms and embeds contribute nothing', async ({
    page,
  }) => {
    const fragment = await parse(
      page,
      `<p>visible</p><p style="display:none">hidden</p><div hidden>hidden</div><script>1</script><style>x</style>
       <img src="x"><iframe src="x"></iframe><svg><text>svg</text></svg><button>click</button><input value="x"><object>o</object>`,
    );

    expect(outlineOf(fragment)).toEqual(['paragraph:visible']);
  });

  test('returns null for empty, whitespace-only, markup-only and oversized input', async ({
    page,
  }) => {
    for (const html of ['', '   ', '<p></p><div> </div>', '<script>1</script>']) {
      expect(await parse(page, html)).toBeNull();
    }
    expect(
      await page.evaluate(() =>
        (window as any).__inkbrickClipboard.htmlToFragment('<p>x</p>'.repeat(300_000)),
      ),
    ).toBeNull();
  });

  test('survives hostile nesting without hanging or throwing', async ({ page }) => {
    const result = await page.evaluate(() => {
      const html = '<div>'.repeat(5000) + 'deep' + '</div>'.repeat(5000);
      const start = performance.now();
      const fragment = (window as any).__inkbrickClipboard.htmlToFragment(html);

      return {
        ms: performance.now() - start,
        ok: fragment === null || Array.isArray(fragment.blocks),
      };
    });

    expect(result.ok).toBe(true);
    expect(result.ms).toBeLessThan(3000);
  });
});

test.describe('Read-only copy', () => {
  test('copies rich HTML from a read-only document, and paste is ignored', async ({
    page,
    context,
  }) => {
    await useSystemClipboard(context);
    await page.goto('/');
    await useTool(page, 'load-sample');
    await page.getByTestId('mode-read').click();

    await page.locator(editable).first().click();
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press(`${modifier}+C`);

    const { html, text } = await readClipboard(page);

    expect(html).toContain('<h2>A heading</h2>');
    expect(html).toContain('<pre><code class="language-python">print(1)</code></pre>');
    expect(text).toContain('Last paragraph');

    const before = await outline(page);
    await pasteData(page, { html: '<p>nope</p>', text: 'nope' });
    expect(await outline(page)).toEqual(before);
  });
});
