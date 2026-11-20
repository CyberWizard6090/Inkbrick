import { describe, expect, it } from 'vitest';

import {
  createSchemaRegistry,
  deserializeDocument,
  exportDocument,
  parseDelimited,
  serializeDelimited,
  tableBlockSchemas,
  toHtml,
  toMarkdown,
  toPlainText,
  type BaseBlock,
  Document,
  type InlineNode,
} from '../src';

const schema = createSchemaRegistry(tableBlockSchemas);

interface Cell {
  content?: InlineNode[];
  align?: 'left' | 'center' | 'right' | 'justify';
}

/** Документ с таблицей: `rows[r][c]` — ячейка (строка — простой текст). Таблица стоит между двумя абзацами. */
function build(
  rows: (string | Cell)[][],
  props: Record<string, unknown> = {},
  { unchecked = false }: { unchecked?: boolean } = {},
): Document {
  const blocks: Record<string, BaseBlock> = {};
  const rowIds: string[] = [];

  rows.forEach((row, r) => {
    const cellIds = row.map((cell, c) => {
      const spec: Cell = typeof cell === 'string' ? { content: [{ insert: cell }] } : cell;
      const id = `cell-${r}-${c}`;

      blocks[id] = {
        id,
        flavour: 'block:table-cell',
        parentId: `row-${r}`,
        children: [],
        content: (spec.content ?? []).filter((node) => node.insert !== ''),
        props: spec.align ? { align: spec.align } : {},
      };

      return id;
    });

    blocks[`row-${r}`] = {
      id: `row-${r}`,
      flavour: 'block:table-row',
      parentId: 'table',
      children: cellIds,
      content: [],
      props: {},
    };
    rowIds.push(`row-${r}`);
  });

  blocks.table = {
    id: 'table',
    flavour: 'block:table',
    parentId: 'note',
    children: rowIds,
    content: [],
    props,
  };
  blocks.before = {
    id: 'before',
    flavour: 'block:paragraph',
    parentId: 'note',
    children: [],
    content: [{ insert: 'before' }],
    props: {},
  };
  blocks.after = {
    id: 'after',
    flavour: 'block:paragraph',
    parentId: 'note',
    children: [],
    content: [{ insert: 'after' }],
    props: {},
  };
  blocks.note = {
    id: 'note',
    flavour: 'block:note',
    parentId: 'page',
    children: ['before', 'table', 'after'],
    content: [],
    props: {},
  };
  blocks.page = {
    id: 'page',
    flavour: 'block:page',
    parentId: null,
    children: ['note'],
    content: [],
    props: { title: '' },
  };

  // Экспорт должен быть безопасным и для данных, прошедших мимо схем (кривые таблицы из чужого снимка).
  if (unchecked) {
    const document = new Document('page');

    Object.values(blocks).forEach((block) => document._setBlock(block));

    return document;
  }

  return deserializeDocument({ rootId: 'page', blocks }, { schema });
}

describe('serializeDelimited / parseDelimited', () => {
  it('writes tab-separated text and quotes what would break it', () => {
    expect(
      serializeDelimited([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a\tb\nc\td');
    expect(serializeDelimited([['tab\there', 'two\nlines', 'say "hi"', '']])).toBe(
      '"tab\there"\t"two\nlines"\t"say ""hi"""\t',
    );
    expect(serializeDelimited([['a,b', 'c']], ',')).toBe('"a,b",c');
    expect(serializeDelimited([])).toBe('');
  });

  it('reads it back, with quotes, any line endings and a trailing newline', () => {
    expect(parseDelimited('a\tb\nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseDelimited('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseDelimited('a\rb')).toEqual([['a'], ['b']]);
    expect(parseDelimited('"x\ty"\t"two\nlines"\t"say ""hi"""')).toEqual([
      ['x\ty', 'two\nlines', 'say "hi"'],
    ]);
    expect(parseDelimited('a,"b,c"\nd,e', ',')).toEqual([
      ['a', 'b,c'],
      ['d', 'e'],
    ]);
  });

  it('keeps empty cells and rows of different length', () => {
    expect(parseDelimited('a\t\tc\n\nd')).toEqual([['a', '', 'c'], [''], ['d']]);
    expect(parseDelimited('\t')).toEqual([['', '']]);
  });

  it('treats a quote in the middle of a cell as text and survives an unclosed quote', () => {
    expect(parseDelimited('5" pipe\tx')).toEqual([['5" pipe', 'x']]);
    expect(parseDelimited('"open\ttext')).toEqual([['open\ttext']]);
  });

  it('round-trips awkward cells', () => {
    const rows = [
      ['plain', 'tab\tinside', 'new\nline'],
      ['"quoted"', '', 'a\r\nb'],
    ];

    expect(parseDelimited(serializeDelimited(rows))).toEqual([
      ['plain', 'tab\tinside', 'new\nline'],
      ['"quoted"', '', 'a\nb'].map((cell, index) => (index === 2 ? 'a\r\nb' : cell)),
    ]);
  });

  it('empty text is no rows; too many cells is refused', () => {
    expect(parseDelimited('')).toEqual([]);
    expect(parseDelimited('\t'.repeat(60_000))).toBeNull();
  });
});

describe('table export', () => {
  const rows = [
    ['Name', 'Qty'],
    ['Apple', '3'],
    ['Pear', '10'],
  ];

  it('plain text: tab-separated rows between the paragraphs', () => {
    expect(toPlainText(build(rows), { title: false })).toBe(
      'before\n\nName\tQty\nApple\t3\nPear\t10\n\nafter',
    );
  });

  it('plain text quotes cells with tabs, quotes and line breaks', () => {
    const document = build([
      [{ content: [{ insert: 'a\tb' }] }, { content: [{ insert: 'x\ny' }] }],
    ]);

    expect(toPlainText(document, { title: false })).toBe('before\n\n"a\tb"\t"x\ny"\n\nafter');
  });

  it('html: header in <thead>, widths in <colgroup>, escaped text, alignment', () => {
    const document = build(
      [
        [{ content: [{ insert: 'A <b>' }], align: 'center' }, { content: [{ insert: 'B' }] }],
        [{ content: [{ insert: 'x', attributes: { bold: true } }, { insert: '\ny' }] }, ''],
      ],
      { widths: [120, null] },
    );

    expect(toHtml(document)).toBe(
      '<p>before</p>\n' +
        '<table><colgroup><col style="width:120px"><col></colgroup>' +
        '<thead><tr><th style="text-align:center;border:1px solid #e9e9e7">A &lt;b&gt;</th><th style="border:1px solid #e9e9e7">B</th></tr></thead>' +
        '<tbody><tr><td style="border:1px solid #e9e9e7"><strong>x</strong><br>y</td><td style="border:1px solid #e9e9e7"></td></tr></tbody></table>\n' +
        '<p>after</p>',
    );
  });

  it('html without a header row has only <tbody>', () => {
    const html = toHtml(build([['a', 'b']], { header: false }));

    expect(html).toContain(
      '<table><tbody><tr><td style="border:1px solid #e9e9e7">a</td><td style="border:1px solid #e9e9e7">b</td></tr></tbody></table>',
    );
    expect(html).not.toContain('<thead>');
  });

  it('markdown: a GFM table with alignment, <br> and escaped pipes', () => {
    const document = build([
      [
        { content: [{ insert: 'Item' }], align: 'left' },
        { content: [{ insert: 'Price' }], align: 'right' },
        'Note',
      ],
      [
        'a|b',
        { content: [{ insert: '1\n2' }] },
        { content: [{ insert: 'x|y', attributes: { code: true } }] },
      ],
    ]);

    expect(toMarkdown(document)).toBe(
      'before\n\n' +
        '| Item | Price | Note |\n' +
        '| :--- | ---: | --- |\n' +
        '| a\\|b | 1<br>2 | `x\\|y` |\n\n' +
        'after\n',
    );
  });

  it('markdown without a header row starts with an empty header so no data is lost', () => {
    expect(
      toMarkdown(
        build(
          [
            ['a', 'b'],
            ['c', 'd'],
          ],
          { header: false },
        ),
      ),
    ).toBe('before\n\n|   |   |\n| --- | --- |\n| a | b |\n| c | d |\n\nafter\n');
  });

  it('rows shorter than the first one are padded', () => {
    const document = build([['a', 'b', 'c'], ['d']], {}, { unchecked: true });

    expect(toHtml(document)).toContain(
      '<td style="border:1px solid #e9e9e7">d</td><td></td><td></td>',
    );
    expect(toMarkdown(document)).toContain('| d |  |  |');
  });

  it('works through exportDocument and with the schema option', () => {
    const document = build(rows);

    expect(exportDocument(document, 'html', { schema })).toContain('<table>');
    expect(exportDocument(document, 'markdown', { schema })).toContain('| --- | --- |');
    expect(exportDocument(document, 'text', { schema, title: false })).toContain('Apple\t3');
  });

  it('a table with no rows or with stray children does not break the export', () => {
    const document = build([], {}, { unchecked: true });

    expect(toHtml(document)).toBe('<p>before</p>\n\n<p>after</p>');
    expect(toMarkdown(document)).toBe('before\n\nafter\n');
    expect(toPlainText(document, { title: false })).toBe('before\n\nafter');
  });
});

describe('a merge that starts in the header row', () => {
  it('is cut at the header: rowspan does not cross thead and tbody', () => {
    const html = toHtml(
      build(
        [
          ['a', 'b', 'z'],
          ['1', '2', '3'],
          ['4', '5', '6'],
        ],
        { merges: [{ row: 0, column: 2, rows: 2, columns: 1 }] },
      ),
    );

    expect(html).not.toContain('rowspan');
    expect(html).toMatch(/<th[^>]*>z<\/th><\/tr><\/thead>/);
    expect(html).toMatch(/<td[^>]*>3<\/td>/);
  });
});
