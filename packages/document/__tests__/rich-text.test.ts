import { describe, expect, it } from 'vitest';

import {
  FORMULA_CHAR,
  MAX_FORMULA_LENGTH,
  alignProps,
  createSchemaRegistry,
  deserializeDocument,
  exportColor,
  getBlockAlign,
  isAlignable,
  isColorName,
  safeCssColor,
  toHtml,
  toMarkdown,
  toPlainText,
  type BaseBlock,
  type Document,
  type InlineNode,
} from '../src';

const schema = createSchemaRegistry();

type Spec = { flavour: string; content?: InlineNode[]; props?: Record<string, unknown> };

function build(blocks: Spec[]): Document {
  const all: Record<string, BaseBlock> = {
    page: {
      id: 'page',
      flavour: 'block:page',
      parentId: null,
      children: ['note'],
      content: [],
      props: { title: '' },
    },
    note: {
      id: 'note',
      flavour: 'block:note',
      parentId: 'page',
      children: [],
      content: [],
      props: {},
    },
  };

  blocks.forEach((spec, index) => {
    const id = `b${index}`;

    all[id] = {
      id,
      flavour: spec.flavour,
      parentId: 'note',
      children: [],
      content: spec.content ?? [],
      props: spec.props ?? {},
    };
    all.note.children.push(id);
  });

  return deserializeDocument({ rootId: 'page', blocks: all }, { schema });
}

const text = (insert: string, attributes?: InlineNode['attributes']): InlineNode =>
  attributes ? { insert, attributes } : { insert };

describe('colors', () => {
  it('knows the palette names and nothing else', () => {
    expect(isColorName('red')).toBe(true);
    expect(isColorName('Red')).toBe(false);
    expect(isColorName('#ff0000')).toBe(false);
    expect(isColorName(undefined)).toBe(false);
  });

  it('accepts only safe CSS colors', () => {
    for (const ok of [
      '#fff',
      '#0078D4',
      'rgb(1, 2, 3)',
      'rgba(1,2,3,.5)',
      'hsl(10 20% 30%)',
      'tomato',
    ]) {
      expect(safeCssColor(ok), ok).toBe(ok);
    }

    for (const bad of [
      'url(x)',
      'red; background: url(x)',
      'expression(1)',
      'var(--x)',
      '',
      42,
      null,
      'a'.repeat(30),
    ]) {
      expect(safeCssColor(bad), String(bad)).toBeNull();
    }
  });

  it('exports palette names as light-theme hex and passes safe colors through', () => {
    expect(exportColor('red', 'text')).toBe('#e5192b');
    expect(exportColor('yellow', 'background')).toBe('#ffe74a');
    expect(exportColor('black', 'text')).toBe('#000000');
    expect(exportColor('white', 'background')).toBe('#ffffff');
    expect(exportColor('#123456', 'text')).toBe('#123456');
    expect(exportColor('url(x)', 'text')).toBeNull();
  });
});

describe('alignment', () => {
  it('names the right prop per block type', () => {
    expect(alignProps('block:paragraph', 'center')).toEqual({ alignment: 'center' });
    expect(alignProps('block:heading', 'right')).toEqual({ align: 'right' });
    expect(alignProps('block:quote', 'justify')).toEqual({ align: 'justify' });
    expect(alignProps('block:code', 'center')).toBeUndefined();
  });

  it('reads it back, defaulting to left, and ignores unsupported blocks', () => {
    expect(getBlockAlign({ flavour: 'block:paragraph', props: { alignment: 'center' } })).toBe(
      'center',
    );
    expect(getBlockAlign({ flavour: 'block:heading', props: {} })).toBe('left');
    expect(getBlockAlign({ flavour: 'block:list', props: { align: 'bogus' } })).toBe('left');
    expect(getBlockAlign({ flavour: 'block:image', props: { align: 'center' } })).toBeUndefined();
    expect(isAlignable('block:callout')).toBe(true);
    expect(isAlignable('block:code')).toBe(false);
  });

  it('is accepted by the schemas of every alignable block, as an optional prop', () => {
    expect(schema.validateProps('block:heading', { level: 1, align: 'justify' }).success).toBe(
      true,
    );
    expect(schema.validateProps('block:quote', { align: 'center' }).success).toBe(true);
    expect(schema.validateProps('block:list', { type: 'bullet', align: 'right' }).success).toBe(
      true,
    );
    expect(schema.validateProps('block:callout', { tone: 'info', align: 'center' }).success).toBe(
      true,
    );
    expect(schema.validateProps('block:quote', { align: 'diagonal' }).success).toBe(false);
    expect(schema.createProps('block:quote')).toEqual({});
  });
});

describe('formula block schema', () => {
  it('is a text-less block allowed in a note', () => {
    expect(schema.hasBlock('block:formula')).toBe(true);
    expect(schema.getBlockSchema('block:formula')!.inline).toBe(false);
    expect(schema.validateRelation('block:note', 'block:formula')).toBe(true);
    expect(schema.validateRelation('block:paragraph', 'block:formula')).toBe(false);
    expect(schema.createProps('block:formula')).toEqual({ latex: '' });
  });

  it('limits the length of the source', () => {
    expect(
      schema.validateProps('block:formula', { latex: 'x'.repeat(MAX_FORMULA_LENGTH) }).success,
    ).toBe(true);
    expect(
      schema.validateProps('block:formula', { latex: 'x'.repeat(MAX_FORMULA_LENGTH + 1) }).success,
    ).toBe(false);
  });
});

describe('export of formulas, colors and alignment', () => {
  const inline = [text('E = '), text(FORMULA_CHAR, { formula: 'mc^2' }), text(' ok')];

  it('plain text uses the LaTeX source instead of the object character', () => {
    const document = build([
      { flavour: 'block:paragraph', content: inline, props: { alignment: 'left' } },
      { flavour: 'block:formula', props: { latex: '\\frac{a}{b}' } },
    ]);

    expect(toPlainText(document, { title: false })).toBe('E = mc^2 ok\n\n\\frac{a}{b}');
  });

  it('markdown: $…$ inline and $$ blocks; empty formulas vanish', () => {
    const document = build([
      { flavour: 'block:paragraph', content: inline, props: { alignment: 'left' } },
      { flavour: 'block:formula', props: { latex: 'a^2+b^2=c^2' } },
      { flavour: 'block:formula', props: { latex: '' } },
    ]);

    expect(toMarkdown(document, { title: false })).toBe('E = $mc^2$ ok\n\n$$\na^2+b^2=c^2\n$$\n');
  });

  it('markdown falls back to \\( \\) when the code contains a dollar sign', () => {
    const document = build([
      {
        flavour: 'block:paragraph',
        content: [text(FORMULA_CHAR, { formula: 'a\\$b' })],
        props: { alignment: 'left' },
      },
    ]);

    expect(toMarkdown(document, { title: false })).toBe('\\(a\\$b\\)\n');
  });

  it('html: math spans with escaped source', () => {
    const document = build([
      {
        flavour: 'block:paragraph',
        content: [text(FORMULA_CHAR, { formula: 'a<b & c' })],
        props: { alignment: 'left' },
      },
      { flavour: 'block:formula', props: { latex: 'x"y' } },
    ]);

    expect(toHtml(document, { title: false })).toBe(
      '<p><span class="math inline">\\(a&lt;b &amp; c\\)</span></p>\n<div class="math display">\\[x&quot;y\\]</div>',
    );
  });

  it('every atom of a merged node becomes its own formula', () => {
    const document = build([
      {
        flavour: 'block:paragraph',
        content: [text(FORMULA_CHAR.repeat(2), { formula: 'x' })],
        props: { alignment: 'left' },
      },
    ]);

    expect(toMarkdown(document, { title: false })).toBe('$x$$x$\n');
  });

  it('html: colors become inline styles (palette → hex) and unsafe values are dropped', () => {
    const document = build([
      {
        flavour: 'block:paragraph',
        content: [
          text('a', { color: 'red', backgroundColor: 'yellow' }),
          text('b', { color: 'red; background: url(x)' }),
          text('c', { backgroundColor: '#123456' }),
        ],
        props: { alignment: 'left' },
      },
    ]);

    expect(toHtml(document, { title: false })).toBe(
      '<p><span style="color:#e5192b;background-color:#ffe74a">a</span>b<span style="background-color:#123456">c</span></p>',
    );
  });

  it('html: alignment of quote, callout and list items', () => {
    const document = build([
      { flavour: 'block:quote', content: [text('q')], props: { align: 'center' } },
      { flavour: 'block:callout', content: [text('c')], props: { tone: 'info', align: 'right' } },
      { flavour: 'block:list', content: [text('l')], props: { type: 'bullet', align: 'justify' } },
    ]);
    const html = toHtml(document, { title: false });

    expect(html).toContain('<blockquote style="text-align:center">q</blockquote>');
    expect(html).toContain('<aside data-callout="info" style="text-align:right">c</aside>');
    expect(html).toContain('<li style="text-align:justify">l</li>');
  });
});
