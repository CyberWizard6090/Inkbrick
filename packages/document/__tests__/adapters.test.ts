import { describe, expect, it } from 'vitest';

import {
  createSchemaRegistry,
  deserializeDocument,
  Document,
  exportDocument,
  toHtml,
  toMarkdown,
  toPlainText,
  type BaseBlock,
  type InlineNode,
} from '../src';

type Spec = {
  flavour: string;
  content?: InlineNode[];
  props?: Record<string, unknown>;
  children?: Spec[];
};

const schema = createSchemaRegistry();

function build(blocks: Spec[], title = 'Doc'): Document {
  const all: Record<string, BaseBlock> = {};
  let n = 0;

  const add = (spec: Spec, parentId: string): string => {
    const id = `b${++n}`;

    all[id] = {
      id,
      flavour: spec.flavour,
      parentId,
      children: (spec.children ?? []).map((child) => add(child, id)),
      content: spec.content ?? [],
      props: spec.props ?? {},
    };

    return id;
  };

  const noteId = 'note';

  all.page = {
    id: 'page',
    flavour: 'block:page',
    parentId: null,
    children: [noteId],
    content: [],
    props: { title },
  };
  all[noteId] = {
    id: noteId,
    flavour: 'block:note',
    parentId: 'page',
    children: blocks.map((spec) => add(spec, noteId)),
    content: [],
    props: {},
  };

  return deserializeDocument({ rootId: 'page', blocks: all }, { schema });
}

/** Документ без проверки props: экспорт должен быть безопасным и для данных, прошедших мимо схем. */
function buildUnchecked(blocks: Spec[]): Document {
  const checked = build([]);
  const document = new Document('page');
  const ids = blocks.map((_, index) => `u${index}`);

  blocks.forEach((spec, index) => {
    document._setBlock({
      id: ids[index],
      flavour: spec.flavour,
      parentId: 'note',
      children: [],
      content: spec.content ?? [],
      props: spec.props ?? {},
    });
  });

  document._setBlock(checked.getBlock('page')!);
  document._setBlock({ ...checked.getBlock('note')!, children: ids });

  return document;
}

const text = (insert: string, attributes?: InlineNode['attributes']): InlineNode =>
  attributes ? { insert, attributes } : { insert };

const paragraph = (...content: InlineNode[]): Spec => ({
  flavour: 'block:paragraph',
  content,
  props: { alignment: 'left' },
});

describe('toPlainText', () => {
  it('separates blocks with a blank line and renders lists with markers', () => {
    const document = build([
      paragraph(text('Hello '), text('world', { bold: true })),
      { flavour: 'block:heading', content: [text('Title')], props: { level: 2 } },
      { flavour: 'block:list', content: [text('one')], props: { type: 'bullet' } },
      {
        flavour: 'block:list',
        content: [text('two')],
        props: { type: 'bullet' },
        children: [
          { flavour: 'block:list', content: [text('nested')], props: { type: 'ordered' } },
        ],
      },
      { flavour: 'block:list', content: [text('done')], props: { type: 'todo', checked: true } },
      { flavour: 'block:divider' },
    ]);

    expect(toPlainText(document)).toBe(
      'Doc\n\nHello world\n\nTitle\n\n- one\n- two\n  1. nested\n[x] done\n\n---',
    );
  });

  it('can skip the title and export a subtree', () => {
    const document = build([paragraph(text('a')), paragraph(text('b'))]);

    expect(toPlainText(document, { title: false })).toBe('a\n\nb');
    expect(toPlainText(document, { from: 'b2' })).toBe('b');
  });

  it('uses image caption or alt', () => {
    const document = build([
      { flavour: 'block:image', props: { src: '', alt: 'cat', caption: '' } },
    ]);

    expect(toPlainText(document, { title: false })).toBe('cat');
  });
});

describe('toMarkdown', () => {
  it('renders headings, inline formatting and links', () => {
    const document = build([
      { flavour: 'block:heading', content: [text('Hi')], props: { level: 3 } },
      paragraph(
        text('a '),
        text('bold', { bold: true }),
        text(' '),
        text('it', { italic: true }),
        text(' '),
        text('gone', { strike: true }),
        text(' '),
        text('code', { code: true }),
        text(' '),
        text('site', { link: 'https://example.com/a(b)' }),
      ),
    ]);

    expect(toMarkdown(document, { title: false })).toBe(
      '### Hi\n\na **bold** *it* ~~gone~~ `code` [site](https://example.com/a%28b%29)\n',
    );
  });

  it('keeps surrounding spaces outside of emphasis markers', () => {
    const document = build([paragraph(text(' spaced ', { bold: true }))]);

    expect(toMarkdown(document, { title: false })).toBe(' **spaced** \n');
  });

  it('escapes markdown syntax in text and at line start', () => {
    const document = build([
      paragraph(text('# not a heading *star* [x](y)')),
      paragraph(text('1. not a list')),
    ]);

    expect(toMarkdown(document, { title: false })).toBe(
      '\\# not a heading \\*star\\* \\[x\\](y)\n\n\\1. not a list\n',
    );
  });

  it('drops unsafe links', () => {
    const document = build([paragraph(text('click', { link: 'javascript:alert(1)' }))]);

    expect(toMarkdown(document, { title: false })).toBe('click\n');
  });

  it('numbers ordered lists, nests children and renders todos', () => {
    const document = build([
      { flavour: 'block:list', content: [text('a')], props: { type: 'ordered' } },
      {
        flavour: 'block:list',
        content: [text('b')],
        props: { type: 'ordered' },
        children: [
          { flavour: 'block:list', content: [text('c')], props: { type: 'todo', checked: false } },
        ],
      },
      paragraph(text('after')),
      { flavour: 'block:list', content: [text('restart')], props: { type: 'ordered' } },
    ]);

    expect(toMarkdown(document, { title: false })).toBe(
      '1. a\n2. b\n   - [ ] c\n\nafter\n\n1. restart\n',
    );
  });

  it('renders quote, callout, divider, image and code with a safe fence', () => {
    const document = build([
      { flavour: 'block:quote', content: [text('q')] },
      { flavour: 'block:callout', content: [text('careful')], props: { tone: 'warning' } },
      { flavour: 'block:divider' },
      {
        flavour: 'block:image',
        props: { src: 'https://example.com/i.png', alt: 'pic', caption: 'cap' },
      },
      { flavour: 'block:code', content: [text('a ``` b')], props: { language: 'ts' } },
    ]);

    expect(toMarkdown(document, { title: false })).toBe(
      [
        '> q',
        '> [!WARNING]\n> careful',
        '---',
        '![pic](https://example.com/i.png)\n\n*cap*',
        '````ts\na ``` b\n````',
      ].join('\n\n') + '\n',
    );
  });

  it('puts the code caption under the fence', () => {
    const document = build([
      { flavour: 'block:code', content: [text('x')], props: { language: 'ts', caption: 'a *b*' } },
    ]);

    expect(toMarkdown(document, { title: false })).toBe('```ts\nx\n```\n\n*a \\*b\\**\n');
  });

  it('includes the page title by default', () => {
    expect(toMarkdown(build([paragraph(text('x'))], 'My *doc*'))).toBe('# My \\*doc\\*\n\nx\n');
  });

  it('returns an empty string for an empty document without title', () => {
    expect(toMarkdown(build([]), { title: false })).toBe('');
  });
});

describe('toHtml', () => {
  it('renders blocks and escapes text', () => {
    const document = build([
      { flavour: 'block:heading', content: [text('<b>')], props: { level: 1, align: 'center' } },
      paragraph(text('a & b', { bold: true, italic: true })),
      { flavour: 'block:code', content: [text('x < 1\ny')], props: { language: 'ts' } },
    ]);

    expect(toHtml(document, { title: false })).toBe(
      [
        '<h1 style="text-align:center">&lt;b&gt;</h1>',
        '<p><em><strong>a &amp; b</strong></em></p>',
        '<pre><code class="language-ts">x &lt; 1\ny</code></pre>',
      ].join('\n'),
    );
  });

  it('wraps captioned code in a figure and escapes the caption', () => {
    const document = build([
      { flavour: 'block:code', content: [text('x')], props: { language: 'ts', caption: '<i>' } },
    ]);

    expect(toHtml(document, { title: false })).toBe(
      '<figure><pre><code class="language-ts">x</code></pre><figcaption>&lt;i&gt;</figcaption></figure>',
    );
  });

  it('groups list items and nests lists', () => {
    const document = build([
      { flavour: 'block:list', content: [text('a')], props: { type: 'bullet' } },
      {
        flavour: 'block:list',
        content: [text('b')],
        props: { type: 'bullet' },
        children: [
          { flavour: 'block:list', content: [text('c')], props: { type: 'todo', checked: true } },
        ],
      },
      { flavour: 'block:list', content: [text('n')], props: { type: 'ordered' } },
    ]);

    expect(toHtml(document, { title: false })).toBe(
      '<ul><li>a</li><li>b<ul><li><input type="checkbox" disabled checked> c</li></ul></li></ul><ol><li>n</li></ol>',
    );
  });

  it('never emits unsafe urls or attribute injection', () => {
    const document = buildUnchecked([
      paragraph(
        text('x', { link: 'javascript:alert(1)' }),
        text('y', { link: 'https://a.b/?q="><script>' }),
      ),
      {
        flavour: 'block:image',
        props: { src: 'https://e.com/a.png" onerror="x', alt: '"><b>', caption: '' },
      },
      {
        flavour: 'block:callout',
        content: [text('c')],
        props: { tone: 'evil" onclick="x', icon: '<i>' },
      },
    ]);
    const html = toHtml(document, { title: false });

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toMatch(/onclick="x"/);
    expect(html).toContain('<a href="https://a.b/?q=&quot;&gt;&lt;script&gt;"');
  });

  it('escapes the title', () => {
    expect(toHtml(build([], '<x>'))).toBe('<h1>&lt;x&gt;</h1>\n');
  });
});

describe('exportDocument', () => {
  it('dispatches by format and rejects unknown ones', () => {
    const document = build([paragraph(text('x'))], '');

    expect(exportDocument(document, 'text')).toBe('x');
    expect(exportDocument(document, 'markdown')).toBe('x\n');
    expect(exportDocument(document, 'html')).toBe('<p>x</p>');
    expect(() => exportDocument(document, 'pdf' as never)).toThrow('Unknown export format');
  });

  it('treats custom hub blocks as containers when a schema is given', () => {
    const custom = createSchemaRegistry([
      {
        flavour: 'block:section',
        name: 'Section',
        icon: 'section',
        role: 'hub',
        allowedParents: ['block:note'],
        allowedChildren: '*',
        commands: [],
        shortcuts: [],
        rendererHint: 'section',
        propsSchema: schema.requireBlockSchema('block:note').propsSchema,
      },
    ]);
    const document = build(
      [{ flavour: 'block:section', children: [paragraph(text('inside'))] }],
      '',
    );

    expect(toPlainText(document, { schema: custom })).toBe('inside');
  });
});
