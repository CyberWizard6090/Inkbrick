import { describe, expect, it } from 'vitest';

import { fragmentToHtml, type Fragment, type FragmentBlock } from '@inkbrick/engine';

import { embeddedFragment, htmlToFragment } from '../src';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function outline(fragment: Fragment | null): unknown[] {
  const walk = (block: FragmentBlock): unknown => {
    const text = block.content.map((node) => node.insert).join('');
    const label = `${block.flavour.replace('block:', '')}:${text}`;

    return block.children.length > 0 ? [label, block.children.map(walk)] : label;
  };

  return fragment ? fragment.blocks.map(walk) : [];
}

const parse = (html: string) => htmlToFragment(html);

/** Текст ячеек таблицы по строкам. */
const grid = (table: FragmentBlock) =>
  table.children.map((row) =>
    row.children.map((cell) => cell.content.map((node) => node.insert).join('')),
  );
const first = (html: string) => parse(html)!.blocks[0];

describe('htmlToFragment: blocks', () => {
  it('paragraphs, headings, quotes, code and dividers', () => {
    expect(
      outline(
        parse(
          '<h1>Title</h1><h3>Sub</h3><p>One</p><blockquote>Quote</blockquote>' +
            '<pre><code class="language-python">print(1)\n</code></pre><hr><p>Two</p>',
        ),
      ),
    ).toEqual([
      'heading:Title',
      'heading:Sub',
      'paragraph:One',
      'quote:Quote',
      'code:print(1)',
      'divider:',
      'paragraph:Two',
    ]);

    expect(first('<h3>x</h3>').props).toMatchObject({ level: 3 });
    expect(first('<pre class="language-rust">fn</pre>').props).toMatchObject({ language: 'rust' });
    expect(first('<pre data-language="sql">select</pre>').props).toMatchObject({ language: 'sql' });
    expect(first('<pre>plain</pre>').props).toMatchObject({ language: 'plain' });
  });

  it('a blockquote with paragraphs becomes one quote per paragraph, other blocks stay', () => {
    expect(outline(parse('<blockquote><p>a</p><p>b</p><ul><li>c</li></ul></blockquote>'))).toEqual([
      'quote:a',
      'quote:b',
      'list:c',
    ]);
  });

  it('lists: kinds, nesting, Google Docs nested lists without a parent item', () => {
    const fragment = parse('<ol><li>one<ul><li>inner</li></ul></li><li>two</li></ol>');

    expect(outline(fragment)).toEqual([['list:one', ['list:inner']], 'list:two']);
    expect(fragment!.blocks[0].props).toMatchObject({ type: 'ordered' });
    expect(fragment!.blocks[0].children[0].props).toMatchObject({ type: 'bullet' });

    expect(outline(parse('<ul><li>a</li><ul><li>b</li></ul></ul>'))).toEqual([
      ['list:a', ['list:b']],
    ]);
  });

  it('task lists keep the checkbox state', () => {
    const fragment = parse(
      '<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>',
    );

    expect(fragment!.blocks.map((b) => b.props)).toEqual([
      expect.objectContaining({ type: 'todo', checked: true }),
      expect.objectContaining({ type: 'todo', checked: false }),
    ]);
  });

  it('Word list paragraphs (mso-list) become nested list items; markers are not text', () => {
    const html =
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span> First</p>' +
      '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">·</span> Nested</p>' +
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.</span> Second</p>' +
      '<p>After</p>';
    const fragment = parse(html);

    expect(outline(fragment)).toEqual([
      ['list:First', ['list:Nested']],
      'list:Second',
      'paragraph:After',
    ]);
    expect(fragment!.blocks[0].props).toMatchObject({ type: 'ordered' });
    expect(fragment!.blocks[0].children[0].props).toMatchObject({ type: 'bullet' });
  });

  it('tables: a table block with a row per <tr> and a cell per <td>', () => {
    const table = first(
      '<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td><b>2</b></td></tr></table>',
    );

    expect(table.flavour).toBe('block:table');
    expect(table.props).toEqual({ header: false });
    expect(grid(table)).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
    expect(table.children[1].children[1].content).toEqual([
      { insert: '2', attributes: { bold: true } },
    ]);
  });

  it('callouts round-trip through <aside data-callout>; unknown tones are dropped', () => {
    expect(first('<aside data-callout="warning">Careful</aside>')).toMatchObject({
      flavour: 'block:callout',
      props: expect.objectContaining({ tone: 'warning' }),
    });
    expect(first('<aside data-callout="weird">x</aside>').props).not.toHaveProperty('tone');
    expect(outline(parse('<aside>not a callout</aside>'))).toEqual(['paragraph:not a callout']);
  });

  it('images: figures with captions, images inside paragraphs, unsafe sources are dropped', () => {
    const fragment = parse(
      `<figure><img src="${PNG}" alt="dot"><figcaption> A   dot </figcaption></figure>` +
        `<p>text <img src="https://x.test/a.png"> more</p>` +
        '<img src="javascript:alert(1)"><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="/rel.png">',
    );

    expect(outline(fragment)).toEqual(['image:', 'paragraph:text more', 'image:']);
    expect(fragment!.blocks[0].props).toMatchObject({ src: PNG, alt: 'dot', caption: 'A dot' });
    expect(fragment!.blocks[2].props).toMatchObject({ src: 'https://x.test/a.png' });
  });

  it('skips scripts, styles, comments and hidden elements', () => {
    expect(
      outline(
        parse(
          '<style>p{}</style><script>alert(1)</script><!-- c --><p hidden>h</p>' +
            '<p style="display:none">d</p><p><span style="visibility:hidden">v</span>shown</p>',
        ),
      ),
    ).toEqual(['paragraph:shown']);
  });
});

describe('htmlToFragment: inline formatting', () => {
  const attrs = (html: string) => first(html).content.map((n) => [n.insert, n.attributes ?? {}]);

  it('tags', () => {
    expect(
      attrs(
        '<p><b>b</b><i>i</i><u>u</u><s>s</s><code>c</code><strong>B</strong><em>I</em><del>D</del><kbd>K</kbd></p>',
      ),
    ).toEqual([
      ['b', { bold: true }],
      ['i', { italic: true }],
      ['u', { underline: true }],
      ['s', { strike: true }],
      ['c', { code: true }],
      ['B', { bold: true }],
      ['I', { italic: true }],
      ['D', { strike: true }],
      ['K', { code: true }],
    ]);
  });

  it('inline styles from Google Docs and Word override tags', () => {
    expect(
      attrs(
        '<b style="font-weight:normal" id="docs-internal-guid-1"><p>' +
          '<span style="font-weight:700">bold</span>' +
          '<span style="font-style:italic">it</span>' +
          '<span style="text-decoration:underline line-through">ul</span>' +
          '<span>plain</span></p></b>',
      ),
    ).toEqual([
      ['bold', { bold: true }],
      ['it', { italic: true }],
      ['ul', { underline: true, strike: true }],
      ['plain', {}],
    ]);
  });

  it('links: safe ones are kept and normalised, unsafe ones become plain text', () => {
    expect(attrs('<p><a href="example.com">a</a> <a href="javascript:alert(1)">b</a></p>')).toEqual(
      [
        ['a', { link: 'https://example.com' }],
        [' b', {}],
      ],
    );
  });

  it('whitespace collapses like in a browser; <br> is a line break; nbsp is a space', () => {
    expect(first('<p>  a \n  b&nbsp;c<br>d  </p>').content).toEqual([{ insert: 'a b c\nd' }]);
  });

  it('inline content between blocks becomes its own paragraph', () => {
    expect(outline(parse('loose <b>text</b><p>para</p>tail'))).toEqual([
      'paragraph:loose text',
      'paragraph:para',
      'paragraph:tail',
    ]);
  });
});

describe('htmlToFragment: limits and garbage', () => {
  it('returns null for empty or oversized input, and for content without blocks', () => {
    expect(htmlToFragment('')).toBeNull();
    expect(htmlToFragment('x'.repeat(2_000_001))).toBeNull();
    expect(outline(htmlToFragment('<p>   </p><script>1</script>'))).toEqual([]);
  });

  it('very deep nesting is cut off instead of overflowing the stack', () => {
    const html = '<div>'.repeat(1000) + 'deep' + '</div>'.repeat(1000);

    expect(() => htmlToFragment(html)).not.toThrow();
  });

  it('every block is marked complete (pasting into an empty block takes its type)', () => {
    expect(parse('<h2>a</h2><p>b</p>')!.blocks.every((b) => b.complete)).toBe(true);
  });
});

describe('embeddedFragment', () => {
  const wrap = (json: string) =>
    `<div data-inkbrick-fragment="${encodeURIComponent(json)}"><p>fallback</p></div>`;

  it('restores the exact fragment written by copy, sanitised', () => {
    const fragment = {
      blocks: [
        { flavour: 'block:heading', props: { level: 2 }, content: [{ insert: 'H' }], children: [] },
        {
          flavour: 'block:paragraph',
          props: {},
          content: [{ insert: 'x', attributes: { link: 'javascript:1' } }],
          children: [],
        },
      ],
    };
    const restored = embeddedFragment(wrap(JSON.stringify(fragment)));

    expect(outline(restored)).toEqual(['heading:H', 'paragraph:x']);
    expect(restored!.blocks[1].content[0].attributes).toBeUndefined();
  });

  it('ignores HTML without a fragment and broken payloads', () => {
    expect(embeddedFragment('<p>plain</p>')).toBeNull();
    expect(embeddedFragment('<div data-inkbrick-fragment="%E0%A4%A">x</div>')).toBeNull();
    expect(embeddedFragment('<div data-inkbrick-fragment="{not json">x</div>')).toBeNull();
    expect(embeddedFragment('<div data-inkbrick-fragment="">x</div>')).toBeNull();
  });
});

describe('a large embedded image survives copy and paste through HTML', () => {
  it('keeps an image at the inline size ceiling (base64 twice in the HTML) instead of dropping it', () => {
    // 1,8 МБ после base64 = 2,4 млн символов; алфавит с + и / (в percent-encoding они занимают по 3 символа).
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let seed = 1;
    const payload = Array.from({ length: (1_800_000 * 4) / 3 }, () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;

      return alphabet[(seed >> 8) % 64];
    }).join('');
    const src = `data:image/png;base64,${payload}`;
    const fragment: Fragment = {
      blocks: [{ flavour: 'block:image', props: { src, alt: 'big' }, content: [], children: [] }],
    };
    const html = fragmentToHtml(fragment, encodeURIComponent(JSON.stringify(fragment)));

    expect(html.length).toBeGreaterThan(2_000_000);
    expect(html.length).toBeLessThan(6_000_000);
    expect(embeddedFragment(html)?.blocks[0].props.src).toBe(src);
    expect(htmlToFragment(html)?.blocks[0].props.src).toBe(src);
  });
});

describe('htmlToFragment: tables', () => {
  it('a first row in <thead> or made of <th> is the header', () => {
    expect(
      first('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>')
        .props,
    ).toEqual({ header: true });
    expect(
      first('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>').props,
    ).toEqual({ header: true });
    expect(
      first('<table><tr><th>A</th><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>').props,
    ).toEqual({ header: false });
    expect(
      first('<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>').props,
    ).toEqual({ header: false });
  });

  it('colspan and rowspan become merged cells: the text stays in the first cell of the area', () => {
    const table = first(
      '<table><tr><td colspan="2">wide</td><td rowspan="2">tall</td></tr>' +
        '<tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td><td>e</td></tr></table>',
    );

    expect(grid(table)).toEqual([
      ['wide', '', 'tall'],
      ['a', 'b', ''],
      ['c', 'd', 'e'],
    ]);
    expect(table.props.merges).toEqual([
      { row: 0, column: 0, rows: 1, columns: 2 },
      { row: 0, column: 2, rows: 2, columns: 1 },
    ]);
  });

  it('plain tables carry no merges', () => {
    expect(first('<table><tr><td>a</td><td>b</td></tr></table>').props.merges).toBeUndefined();
  });

  it('rows of different length are padded; absurd spans are refused, not expanded', () => {
    expect(
      grid(first('<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td></tr></table>')),
    ).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
    ]);

    // Больше предела столбцов: таблицы нет, строки приходят текстом.
    const wide = parse(
      '<table><tr><td colspan="99999">x</td><td>y</td></tr><tr><td>z</td></tr></table>',
    )!;

    expect(wide.blocks.every((b) => b.flavour === 'block:paragraph')).toBe(true);
  });

  it('keeps cell formatting and links, drops unsafe ones, keeps lines inside a cell', () => {
    const table = first(
      '<table><tr><td><i>it</i> <a href="https://x.test/">link</a> <a href="javascript:alert(1)">bad</a></td>' +
        '<td><p>one</p><p>two</p></td><td>a<br>b</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>',
    );

    expect(table.children[0].children[0].content).toEqual([
      { insert: 'it', attributes: { italic: true } },
      { insert: ' ' },
      { insert: 'link', attributes: { link: 'https://x.test/' } },
      { insert: ' bad' },
    ]);
    expect(grid(table)[0].slice(1)).toEqual(['one\ntwo', 'a\nb']);
  });

  it('reads alignment from the align attribute and from text-align', () => {
    const table = first(
      '<table><tr><td align="right">a</td><td style="text-align:center">b</td><td style="text-align:left">c</td><td>d</td></tr>' +
        '<tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></table>',
    );

    expect(table.children[0].children.map((cell) => cell.props.align)).toEqual([
      'right',
      'center',
      undefined,
      undefined,
    ]);
  });

  it('a table of one cell is just text (a single cell copied from Excel); an empty one is nothing', () => {
    expect(outline(parse('<table><tr><td><b>cell</b></td></tr></table>'))).toEqual([
      'paragraph:cell',
    ]);
    expect(parse('<table><tr><td> </td></tr></table>')).toBeNull();
    expect(parse('<table></table>')).toBeNull();
  });

  it('a table larger than the limits arrives as rows of text with tabs between the cells', () => {
    const cells = Array.from({ length: 51 }, (_, i) => `<td>${i}</td>`).join('');
    const fragment = parse(`<table><tr>${cells}</tr><tr>${cells}</tr></table>`)!;

    expect(fragment.blocks.map((b) => b.flavour)).toEqual(['block:paragraph', 'block:paragraph']);
    expect(fragment.blocks[0].content[0].insert).toMatch(/^0\t1\t2/);
  });

  it('a nested table is flattened into the text of its cell', () => {
    const table = first(
      '<table><tr><td>outer <table><tr><td>in1</td><td>in2</td></tr></table></td><td>x</td></tr>' +
        '<tr><td>1</td><td>2</td></tr></table>',
    );

    expect(table.children[0].children[0].content.map((n) => n.insert).join('')).toContain('in1');
    expect(table.children).toHaveLength(2);
  });

  it('Excel: class names, <col>, &nbsp; and inline styles do not matter', () => {
    const table = first(
      '<table border=0 cellpadding=0 cellspacing=0 width=192 style="border-collapse:collapse;width:144pt">' +
        '<col width=64 span=3 style="width:48pt"><tr height=20 style="height:15.0pt">' +
        '<td height=20 class=xl65 width=64 style="height:15.0pt;width:48pt">Name</td>' +
        '<td class=xl65 width=64 style="width:48pt">Qty</td><td class=xl66 align=right>Price</td></tr>' +
        '<tr height=20><td height=20>Apple</td><td align=right x:num>3</td><td align=right x:num>1.5</td></tr></table>',
    );

    expect(grid(table)).toEqual([
      ['Name', 'Qty', 'Price'],
      ['Apple', '3', '1.5'],
    ]);
    expect(table.children[1].children[1].props).toEqual({ align: 'right' });
  });

  it('Google Sheets: wrapper element, styles, spans and data attributes', () => {
    const fragment = parse(
      '<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}--></style>' +
        '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" data-sheets-root="1">' +
        '<colgroup><col width="100"><col width="100"></colgroup><tbody>' +
        '<tr style="height:21px;"><td style="font-weight:bold;" data-sheets-value="{&quot;1&quot;:2}">Item</td><td>Total</td></tr>' +
        '<tr><td><span style="font-style:italic;">pear</span></td><td style="text-align:right;">10</td></tr></tbody></table></google-sheets-html-origin>',
    )!;
    const table = fragment.blocks[0];

    expect(table.flavour).toBe('block:table');
    expect(grid(table)).toEqual([
      ['Item', 'Total'],
      ['pear', '10'],
    ]);
    expect(table.children[0].children[0].content).toEqual([
      { insert: 'Item', attributes: { bold: true } },
    ]);
    expect(table.children[1].children[1].props).toEqual({ align: 'right' });
  });

  it('Word: paragraphs and <o:p> inside cells', () => {
    const table = first(
      '<table class=MsoTableGrid border=1><tr><td width=200 valign=top><p class=MsoNormal>First<o:p></o:p></p></td>' +
        '<td width=200 valign=top><p class=MsoNormal>Second<o:p></o:p></p></td></tr>' +
        '<tr><td><p class=MsoNormal>a<o:p></o:p></p><p class=MsoNormal>b<o:p></o:p></p></td><td><p class=MsoNormal><o:p>&nbsp;</o:p></p></td></tr></table>',
    );

    expect(grid(table)).toEqual([
      ['First', 'Second'],
      ['a\nb', ''],
    ]);
  });

  it('a table between paragraphs keeps its place', () => {
    expect(
      parse('<p>before</p><table><tr><td>a</td><td>b</td></tr></table><p>after</p>')!.blocks.map(
        (b) => b.flavour,
      ),
    ).toEqual(['block:paragraph', 'block:table', 'block:paragraph']);
  });

  it('our own exported HTML reads back as the same table', () => {
    const fragment: Fragment = {
      blocks: [
        {
          flavour: 'block:table',
          props: { header: true },
          content: [],
          children: [
            {
              flavour: 'block:table-row',
              props: {},
              content: [],
              children: ['A', 'B'].map((t) => ({
                flavour: 'block:table-cell',
                props: t === 'B' ? { align: 'center' } : {},
                content: [{ insert: t }],
                children: [],
              })),
            },
            {
              flavour: 'block:table-row',
              props: {},
              content: [],
              children: ['1', '2'].map((t) => ({
                flavour: 'block:table-cell',
                props: {},
                content: [{ insert: t }],
                children: [],
              })),
            },
          ],
        },
      ],
    };
    const back = first(fragmentToHtml(fragment));

    expect(back.props).toEqual({ header: true });
    expect(grid(back)).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
    // Выравнивание заголовка (<th style="text-align:center">) читается.
    expect(back.children[0].children[1].props).toEqual({ align: 'center' });
  });
});
