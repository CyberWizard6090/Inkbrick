import { describe, expect, it } from 'vitest';

import {
  createDocument,
  createSchemaRegistry,
  footnoteBlockSchemas,
  MAX_NESTING_DEPTH,
  serializeDocument,
  tableBlockSchemas,
  toggleBlockSchemas,
  toMarkdown,
  validateSnapshot,
  FORMULA_CHAR,
  type Document,
  type InlineNode,
} from '../src';
import { fromMarkdown } from '../src/markdown';

const schema = createSchemaRegistry([
  ...tableBlockSchemas,
  ...toggleBlockSchemas,
  ...footnoteBlockSchemas,
]);

/* Описание документа: [flavour, props, содержимое (текст или узлы), потомки]. */
type Spec = [string, Record<string, unknown>?, (string | InlineNode[])?, Spec[]?];

function build(specs: Spec[]): Document {
  const document = createDocument({ schema, title: '' });
  const note = document.getBlock(document.rootId)!.children[0];
  let index = 0;

  for (const id of [...document.getBlock(note)!.children]) {
    document._removeChild(note, id);
    document._deleteBlock(id);
  }

  const add = (parentId: string, [flavour, props = {}, text = '', children = []]: Spec) => {
    const id = `b${index++}`;

    document._setBlock({
      id,
      flavour,
      parentId,
      children: [],
      content: typeof text === 'string' ? (text ? [{ insert: text }] : []) : text,
      props: schema.createProps(flavour, props),
    });
    document.getBlock(parentId)!.children.push(id);
    children.forEach((child) => add(id, child));
  };

  specs.forEach((spec) => add(note, spec));

  return document;
}

interface Shape {
  f: string;
  p: Record<string, unknown>;
  c: InlineNode[];
  k: Shape[];
}

/** Документ без идентификаторов: форма, props и содержимое блоков заметки. */
function shape(document: Document): Shape[] {
  const walk = (id: string): Shape => {
    const block = document.getBlock(id)!;
    const props = Object.fromEntries(
      Object.entries(block.props).filter(
        ([key, value]) => value !== undefined && !(key === 'checked' && value === false),
      ),
    );

    return { f: block.flavour, p: props, c: block.content, k: block.children.map(walk) };
  };

  const note = document.getBlock(document.rootId)!.children[0];

  return document.getBlock(note)!.children.map(walk);
}

const expectRoundTrip = (specs: Spec[]) => {
  const document = build(specs);
  const markdown = toMarkdown(document, { schema, title: false });
  const back = fromMarkdown(markdown, { schema });

  expect(shape(back)).toEqual(shape(document));
  expect(toMarkdown(back, { schema, title: false })).toBe(markdown);
  expect(validateSnapshot(serializeDocument(back, schema), schema)).toEqual([]);
};

const parse = (markdown: string) => shape(fromMarkdown(markdown, { schema }));
const text = (value: string): InlineNode[] => [{ insert: value }];
const flavours = (markdown: string) => parse(markdown).map((block) => block.f);
const cell = (value: string, align?: string): Spec => [
  'block:table-cell',
  align ? { align } : {},
  value,
];
const row = (...cells: Spec[]): Spec => ['block:table-row', {}, '', cells];

describe('fromMarkdown: round trip of every block', () => {
  it('paragraphs, including text that looks like markup', () => {
    expectRoundTrip([
      ['block:paragraph', {}, 'plain text'],
      ['block:paragraph', {}, '# not a heading'],
      ['block:paragraph', {}, '- not a list'],
      ['block:paragraph', {}, '1. not a list'],
      ['block:paragraph', {}, '> not a quote'],
      ['block:paragraph', {}, 'a * b _ c ~ d | e [f] <g> \\ h'],
      ['block:paragraph', {}, 'two\nlines'],
      ['block:paragraph', {}, 'Привет, мир — «кавычки»'],
    ]);
  });

  it('headings 1-6', () => {
    expectRoundTrip(
      [1, 2, 3, 4, 5, 6].map((level): Spec => ['block:heading', { level }, `Heading ${level}`]),
    );
  });

  it('code takes no formatting: **`x`** is plain code', () => {
    const [block] = parse('**`bold code`** and *`italic code`*');

    expect(block.c).toEqual([
      { insert: 'bold code', attributes: { code: true } },
      { insert: ' and ' },
      { insert: 'italic code', attributes: { code: true } },
    ]);
  });

  it('inline formatting', () => {
    expectRoundTrip([
      [
        'block:paragraph',
        {},
        [
          { insert: 'plain ' },
          { insert: 'bold', attributes: { bold: true } },
          { insert: ' ' },
          { insert: 'italic', attributes: { italic: true } },
          { insert: ' ' },
          { insert: 'strike', attributes: { strike: true } },
          { insert: ' ' },
          { insert: 'under', attributes: { underline: true } },
          { insert: ' ' },
          { insert: 'code', attributes: { code: true } },
          { insert: ' ' },
          { insert: 'both', attributes: { bold: true, italic: true } },
          { insert: ' ' },
          {
            insert: 'all',
            attributes: { bold: true, italic: true, strike: true, underline: true },
          },
          { insert: ' ' },
          { insert: 'link', attributes: { link: 'https://example.com/a?b=1&c=2' } },
          { insert: ' ' },
          { insert: 'bold link', attributes: { bold: true, link: 'https://example.com' } },
          { insert: ' ' },
          { insert: 'linked code', attributes: { code: true, link: 'https://example.com/' } },
          { insert: ' end' },
        ],
      ],
    ]);
  });

  it('adjacent differently formatted runs', () => {
    expectRoundTrip([
      [
        'block:paragraph',
        {},
        [
          { insert: 'a', attributes: { bold: true } },
          { insert: 'b', attributes: { italic: true } },
          { insert: 'c', attributes: { bold: true, italic: true } },
          { insert: 'd', attributes: { strike: true } },
          { insert: 'e' },
        ],
      ],
    ]);
  });

  it('code spans with backticks and a pipe', () => {
    expectRoundTrip([
      [
        'block:paragraph',
        {},
        [
          { insert: 'a`b', attributes: { code: true } },
          { insert: ' and ' },
          { insert: '`edge`', attributes: { code: true } },
          { insert: ' and ' },
          { insert: 'a | b', attributes: { code: true } },
        ],
      ],
    ]);
  });

  it('inline formulas and footnote references', () => {
    expectRoundTrip([
      [
        'block:paragraph',
        {},
        [
          { insert: 'Euler ' },
          { insert: FORMULA_CHAR, attributes: { formula: 'e^{i\\pi}+1=0' } },
          { insert: ' and ' },
          { insert: FORMULA_CHAR, attributes: { formula: 'a$b' } },
          { insert: ' note' },
          { insert: FORMULA_CHAR, attributes: { footnote: '1' } },
          { insert: ' more' },
          { insert: FORMULA_CHAR, attributes: { footnote: '2' } },
        ],
      ],
      ['block:footnote', { id: '1' }, 'First **note**'],
      ['block:footnote', { id: '2' }, 'Second'],
    ]);
  });

  it('lists: bullet, ordered, todo', () => {
    expectRoundTrip([
      ['block:list', { type: 'bullet' }, 'one'],
      ['block:list', { type: 'bullet' }, 'two'],
      ['block:paragraph', {}, 'between'],
      ['block:list', { type: 'ordered' }, 'first'],
      ['block:list', { type: 'ordered' }, 'second'],
      ['block:list', { type: 'ordered' }, 'third'],
      ['block:paragraph', {}, 'between again'],
      ['block:list', { type: 'todo' }, 'open'],
      ['block:list', { type: 'todo', checked: true }, 'done'],
    ]);
  });

  it('nested lists, a paragraph inside an item and a multi-line item', () => {
    expectRoundTrip([
      [
        'block:list',
        { type: 'ordered' },
        'one',
        [
          ['block:list', { type: 'bullet' }, 'one.a', [['block:list', { type: 'todo' }, 'deep']]],
          ['block:list', { type: 'bullet' }, 'one.b'],
          ['block:paragraph', {}, 'a paragraph in the item'],
        ],
      ],
      ['block:list', { type: 'ordered' }, 'two\nsecond line'],
      [
        'block:list',
        { type: 'todo', checked: true },
        'todo',
        [['block:list', { type: 'todo' }, 'sub']],
      ],
    ]);
  });

  it('quote and callouts', () => {
    expectRoundTrip([
      ['block:quote', {}, 'quoted\nwith a second line'],
      ['block:quote', {}, '**bold** inside'],
      ['block:callout', { tone: 'info' }, 'note'],
      ['block:callout', { tone: 'warning' }, 'warning\nmore'],
      ['block:callout', { tone: 'success' }, 'tip'],
      ['block:callout', { tone: 'danger' }, 'caution'],
    ]);
  });

  it('code: language, plain, backticks inside, caption', () => {
    expectRoundTrip([
      ['block:code', { language: 'ts' }, 'const a = 1;\n\nconsole.log(a);'],
      ['block:code', { language: 'plain' }, 'no language'],
      ['block:code', { language: 'md' }, 'fence ``` inside\n- not a list\n# not a heading'],
      ['block:code', { language: 'c++', caption: 'The *caption*' }, 'int main() {}'],
      ['block:code', { language: 'plain' }, ''],
    ]);
  });

  it('divider', () => {
    expectRoundTrip([
      ['block:paragraph', {}, 'a'],
      ['block:divider'],
      ['block:paragraph', {}, 'b'],
    ]);
  });

  it('image with and without a caption', () => {
    expectRoundTrip([
      ['block:image', { src: 'https://example.com/a.png', alt: 'An [image]' }],
      ['block:image', { src: '/local/b.png', alt: 'b', caption: 'Figure *1*' }],
      ['block:image', { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'inline' }],
    ]);
  });

  it('block formula', () => {
    expectRoundTrip([
      ['block:formula', { latex: '\\int_0^1 x\\,dx = \\frac{1}{2}' }],
      ['block:formula', { latex: '\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}' }],
    ]);
  });

  it('table with alignment, pipes and line breaks', () => {
    expectRoundTrip([
      [
        'block:table',
        {},
        '',
        [
          row(cell('Name', 'left'), cell('Qty', 'center'), cell('Price', 'right')),
          row(cell('a | b', 'left'), cell('two\nlines', 'center'), cell('**3**', 'right')),
          row(cell('', 'left'), cell('x', 'center'), cell('', 'right')),
        ],
      ],
    ]);
  });

  it('table without a header row', () => {
    expectRoundTrip([
      [
        'block:table',
        { header: false },
        '',
        [row(cell('a'), cell('b')), row(cell('c'), cell('d'))],
      ],
    ]);
  });

  it('toggle: open, closed, nested blocks and nested toggles', () => {
    expectRoundTrip([
      [
        'block:toggle',
        {},
        'Open **toggle**',
        [
          ['block:paragraph', {}, 'inside'],
          ['block:list', { type: 'bullet' }, 'item'],
          ['block:toggle', { open: false }, 'Inner', [['block:paragraph', {}, 'deep']]],
        ],
      ],
      ['block:toggle', { open: false }, 'Closed', [['block:list', { type: 'todo' }, 'x']]],
      ['block:toggle', {}, 'Empty'],
      ['block:paragraph', {}, 'after'],
    ]);
  });

  it('a mixed document', () => {
    expectRoundTrip([
      ['block:heading', { level: 1 }, 'Title'],
      [
        'block:paragraph',
        {},
        [{ insert: 'Intro with ' }, { insert: 'link', attributes: { link: 'https://a.b' } }],
      ],
      ['block:callout', { tone: 'warning' }, 'Careful'],
      ['block:heading', { level: 2 }, 'Steps'],
      [
        'block:list',
        { type: 'ordered' },
        'install',
        [['block:list', { type: 'bullet' }, 'with pnpm']],
      ],
      ['block:list', { type: 'ordered' }, 'run'],
      ['block:code', { language: 'bash' }, 'pnpm dev'],
      ['block:divider'],
      ['block:image', { src: 'https://example.com/i.png', alt: 'shot', caption: 'Screenshot' }],
      ['block:formula', { latex: 'E=mc^2' }],
      ['block:table', {}, '', [row(cell('k'), cell('v')), row(cell('1'), cell('2'))]],
      ['block:quote', {}, 'A quote'],
      ['block:toggle', {}, 'More', [['block:paragraph', {}, 'hidden']]],
      ['block:list', { type: 'todo', checked: true }, 'ship it'],
      [
        'block:paragraph',
        {},
        [{ insert: 'See' }, { insert: FORMULA_CHAR, attributes: { footnote: '1' } }],
      ],
      ['block:footnote', { id: '1' }, 'The note'],
    ]);
  });

  it('an empty text gives a document with one empty paragraph', () => {
    const back = fromMarkdown('', { schema });

    expect(shape(back)).toEqual([{ f: 'block:paragraph', p: expect.any(Object), c: [], k: [] }]);
  });
});

describe('fromMarkdown: the page title', () => {
  it('takes the first "# …" line as the title with titleFromHeading', () => {
    const document = createDocument({ schema, title: 'My page' });
    const markdown = `${toMarkdown(document, { schema })}\nBody\n`;
    const back = fromMarkdown(markdown, { schema, titleFromHeading: true });

    expect(back.getBlock(back.rootId)!.props.title).toBe('My page');
    expect(flavours(markdown)).toContain('block:heading');
    expect(shape(back).map((block) => block.f)).toEqual(['block:paragraph']);
  });

  it('keeps the heading as a block by default and uses options.title', () => {
    const back = fromMarkdown('# Heading\n\ntext', { schema, title: 'Given' });

    expect(back.getBlock(back.rootId)!.props.title).toBe('Given');
    expect(shape(back).map((block) => block.f)).toEqual(['block:heading', 'block:paragraph']);
  });
});

describe('fromMarkdown: markdown written by other tools', () => {
  it('reads other markers, emphasis styles and indentation', () => {
    const blocks = parse(
      [
        '* star',
        '+ plus',
        '',
        '1) paren',
        '',
        '- parent',
        '    - four spaces',
        '  - two spaces',
        '',
        '__bold__ and _italic_ and ***both***',
      ].join('\n'),
    );

    expect(blocks.map((block) => block.f)).toEqual([
      'block:list',
      'block:list',
      'block:list',
      'block:list',
      'block:paragraph',
    ]);
    expect(blocks[2].p.type).toBe('ordered');
    expect(blocks[3].k.map((item) => item.c)).toEqual([text('four spaces'), text('two spaces')]);
    expect(blocks[4].c).toEqual([
      { insert: 'bold', attributes: { bold: true } },
      { insert: ' and ' },
      { insert: 'italic', attributes: { italic: true } },
      { insert: ' and ' },
      { insert: 'both', attributes: { bold: true, italic: true } },
    ]);
  });

  it('reads tilde fences, long fences and an unterminated fence', () => {
    expect(parse('~~~py\nx = 1\n~~~')[0]).toMatchObject({
      p: { language: 'py' },
      c: text('x = 1'),
    });
    expect(parse('````\n```\ninner\n```\n````')[0].c).toEqual(text('```\ninner\n```'));
    expect(parse('```js\nnever closed\nstill code')[0].c).toEqual(text('never closed\nstill code'));
  });

  it('reads thematic breaks in all spellings', () => {
    expect(flavours('***\n\n___\n\n- - -\n\n----')).toEqual(Array(4).fill('block:divider'));
  });

  it('treats a lazily wrapped list line as part of the item', () => {
    const blocks = parse('- first line\n  continued\n- second');

    expect(blocks.map((block) => block.c)).toEqual([text('first line\ncontinued'), text('second')]);
  });

  it('reads a table without outer pipes; extra cells widen the table', () => {
    const [table] = parse('a | b\n--|--\n1 | 2 | 3\n4 | 5');

    expect(table.f).toBe('block:table');
    expect(table.k).toHaveLength(3);
    expect(table.k.map((row) => row.k.length)).toEqual([3, 3, 3]);
    expect(table.k[1].k.map((cell) => cell.c)).toEqual([text('1'), text('2'), text('3')]);
  });

  it('reads <br> in a cell as a line break, and a title or angle brackets in a link', () => {
    const [table] = parse('| a |\n| - |\n| x<br>y |');

    expect(table.k[1].k[0].c).toEqual(text('x\ny'));

    const [paragraph] = parse('[a](<https://example.com/x> "title") and [b](https://e.com \'t\')');

    expect(paragraph.c[0].attributes).toEqual({ link: 'https://example.com/x' });
  });

  it('reads CRLF, a BOM and tabs', () => {
    expect(flavours('\uFEFF# a\r\n\r\ntext\r\n\r\n- x\r\n\t- y')).toEqual([
      'block:heading',
      'block:paragraph',
      'block:list',
    ]);
  });

  it('reads a single-column table and a lone dash', () => {
    expect(flavours('| a |\n| - |\n| b |')).toEqual(['block:table']);
    expect(flavours('---\n-')).toEqual(['block:divider', 'block:list']);
  });

  it('keeps dollar amounts as text and reads "\\(…\\)" formulas', () => {
    expect(parse('It costs $5 and $10 today')[0].c).toEqual(text('It costs $5 and $10 today'));
    expect(parse('A \\(a$b\\) B')[0].c[1].attributes).toEqual({ formula: 'a$b' });
  });

  it('reads "$$" on one line, and an unterminated "$$" stays text', () => {
    expect(parse('$$x^2$$')[0]).toMatchObject({ f: 'block:formula', p: { latex: 'x^2' } });
    expect(parse('$$\nnever closed')[0].c).toEqual(text('$$\nnever closed'));
  });

  it('an unterminated <details> stays text; one without <summary> has an empty title', () => {
    expect(parse('<details>\n\ntext').map((block) => block.c)).toEqual([
      text('<details>'),
      text('text'),
    ]);

    const [toggle] = parse('<details>\nbody\n</details>');

    expect(toggle).toMatchObject({ f: 'block:toggle', p: { open: false }, c: [] });
    expect(toggle.k).toHaveLength(1);
  });

  it('a footnote definition without a reference and a reference without a definition stay', () => {
    const [orphan, paragraph] = parse('[^a]: lost?\n\nsee[^b]');

    expect(orphan).toMatchObject({ f: 'block:footnote', p: { id: 'a' } });
    expect(paragraph.c[1].attributes).toEqual({ footnote: 'b' });
  });
});

describe('fromMarkdown: nothing is lost and nothing is executed', () => {
  it('keeps raw HTML as plain text', () => {
    const blocks = parse(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\ntext <b>bold</b> <u>under</u>',
    );

    expect(blocks.map((block) => block.f)).toEqual(Array(3).fill('block:paragraph'));
    expect(blocks[0].c).toEqual(text('<script>alert(1)</script>'));
    expect(blocks[1].c).toEqual(text('<img src=x onerror=alert(1)>'));
    expect(blocks[2].c).toEqual([
      { insert: 'text <b>bold</b> ' },
      { insert: 'under', attributes: { underline: true } },
    ]);
  });

  it('keeps unsafe links as text', () => {
    const source = '[x](javascript:alert(1)) [y](data:text/html;base64,AAAA) [z](vbscript:a)';

    expect(parse(source)[0].c).toEqual(text(source));
  });

  it('normalizes a bare domain link and keeps mailto, anchors and paths', () => {
    const [paragraph] = parse('[a](example.com) [b](mailto:me@site.org) [c](#top) [d](/path)');

    expect(
      paragraph.c.filter((node) => node.attributes).map((node) => node.attributes!.link),
    ).toEqual(['https://example.com', 'mailto:me@site.org', '#top', '/path']);
  });

  it('keeps unsafe images as text', () => {
    for (const src of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,AAAA',
      'ftp://x/y.png',
      'blob:abc',
    ]) {
      const [block] = parse(`![alt](${src})`);

      expect(block.f).toBe('block:paragraph');
      expect(block.c.map((node) => node.insert).join('')).toContain(src);
    }
  });

  it('keeps an image whose alt is too long as text', () => {
    expect(parse(`![${'a'.repeat(1001)}](https://e.com/a.png)`)[0].f).toBe('block:paragraph');
  });

  it('does not let the object character fake a formula or a footnote', () => {
    expect(parse(`a${FORMULA_CHAR}b`)[0].c).toEqual(text('a\uFFFDb'));
  });

  it('keeps setext headings, indented code and link definitions as text', () => {
    expect(parse('Title\n===')[0].c).toEqual(text('Title\n==='));
    expect(parse('    indented')[0].c).toEqual(text('indented'));
    expect(parse('[ref]: https://e.com')[0].c).toEqual(text('[ref]: https://e.com'));
  });

  it('turns blocks missing from the schema into paragraphs', () => {
    const plain = createSchemaRegistry();
    const markdown =
      '| a | b |\n| - | - |\n| 1 | 2 |\n\n<details>\n<summary>S</summary>\n\nbody\n\n</details>\n\ntext[^1]\n\n[^1]: note';
    const document = fromMarkdown(markdown, { schema: plain });
    const blocks = shape(document);

    expect(blocks.every((block) => block.f === 'block:paragraph')).toBe(true);
    expect(blocks.map((block) => block.c.map((node) => node.insert).join('')).join('\n')).toContain(
      '[^1]: note',
    );
    expect(validateSnapshot(serializeDocument(document, plain), plain)).toEqual([]);
  });

  it('keeps block syntax inside a quote as quote text', () => {
    const [quote] = parse('> # not a heading\n> - not a list');

    expect(quote.f).toBe('block:quote');
    expect(quote.c).toEqual(text('# not a heading\n- not a list'));
  });

  it('puts a block an item cannot hold next to the list', () => {
    const markdown = '- item\n\n   ```js\n   code\n   ```';
    const document = fromMarkdown(markdown, { schema });

    expect(shape(document).map((block) => block.f)).toEqual(['block:list', 'block:code']);
    expect(validateSnapshot(serializeDocument(document, schema), schema)).toEqual([]);
  });
});

describe('fromMarkdown: blocks a parent does not accept', () => {
  it('puts a block a toggle cannot hold right after the toggle', () => {
    const markdown = '<details open>\n\n<summary>T</summary>\n\ninside\n\n> quote\n\n</details>';
    const document = fromMarkdown(markdown, { schema });
    const blocks = shape(document);

    expect(blocks.map((block) => block.f)).toEqual(['block:toggle', 'block:quote']);
    expect(blocks[0].k.map((block) => block.f)).toEqual(['block:paragraph']);
    expect(validateSnapshot(serializeDocument(document, schema), schema)).toEqual([]);
  });
});

describe('fromMarkdown: limits', () => {
  const depthOf = (document: Document, id: string): number => {
    let depth = 0;

    for (
      let block = document.getBlock(id);
      block?.parentId;
      block = document.getBlock(block.parentId)
    )
      depth++;

    return depth;
  };
  const maxDepth = (document: Document) =>
    Math.max(...Object.keys(document.dump()).map((id) => depthOf(document, id)));
  const allText = (document: Document) =>
    Object.values(document.dump())
      .map((block) => block.content.map((node) => node.insert).join(''))
      .join(' ');

  it('rejects a text longer than maxLength', () => {
    expect(() => fromMarkdown('a'.repeat(101), { schema, maxLength: 100 })).toThrow(RangeError);
    expect(() => fromMarkdown('a'.repeat(100), { schema, maxLength: 100 })).not.toThrow();
  });

  it('rejects more blocks than maxBlocks', () => {
    const paragraphs = Array.from({ length: 50 }, (_, index) => `p${index}`).join('\n\n');

    expect(() => fromMarkdown(paragraphs, { schema, maxBlocks: 10 })).toThrow(RangeError);
    expect(() => fromMarkdown('| a | b |\n| - | - |\n| 1 | 2 |', { schema, maxBlocks: 3 })).toThrow(
      RangeError,
    );
  });

  it('never nests deeper than MAX_NESTING_DEPTH and keeps the text of deeper items', () => {
    const lines = Array.from({ length: 200 }, (_, level) => `${'  '.repeat(level)}- item${level}`);
    const document = fromMarkdown(lines.join('\n'), { schema });
    const content = allText(document);

    expect(maxDepth(document)).toBeLessThanOrEqual(MAX_NESTING_DEPTH);

    for (let level = 0; level < 200; level++) expect(content).toContain(`item${level}`);
  });

  it('never nests toggles deeper than MAX_NESTING_DEPTH', () => {
    const open = Array.from(
      { length: 100 },
      (_, level) => `<details>\n\n<summary>t${level}</summary>\n`,
    );
    const document = fromMarkdown(`${open.join('\n')}\nbottom\n\n${'</details>\n\n'.repeat(100)}`, {
      schema,
    });

    expect(maxDepth(document)).toBeLessThanOrEqual(MAX_NESTING_DEPTH);
    expect(allText(document)).toContain('bottom');
    expect(allText(document)).toContain('t99');
  });

  it('survives pathological input quickly', () => {
    const inputs = [
      '['.repeat(100_000),
      '[a]('.repeat(50_000),
      '*_'.repeat(100_000),
      '`'.repeat(100_000),
      '<u>'.repeat(50_000),
      '$ '.repeat(100_000),
      '\\('.repeat(100_000),
      '> '.repeat(100_000),
      '| a '.repeat(50_000),
      '<details>\n'.repeat(50_000),
      '- a\n'.repeat(50_000),
      '```\n'.repeat(50_000),
      // Выделения, вложенные на десятки тысяч уровней, и одна длинная серия `*`, закрываемая много раз.
      '*a '.repeat(100_000) + 'b* '.repeat(100_000),
      '*'.repeat(100_000) + 'a* '.repeat(50_000),
      Array.from({ length: 20_000 }, (_, level) => `${' '.repeat(level % 80)}- x`).join('\n'),
    ];

    for (const input of inputs) {
      const started = performance.now();

      fromMarkdown(input, { schema, maxBlocks: 200_000 });

      // Запас большой (под покрытие и медленный CI): ловится квадратичное время, а оно здесь — минуты.
      expect(performance.now() - started).toBeLessThan(10_000);
    }
  }, 60_000);
});
