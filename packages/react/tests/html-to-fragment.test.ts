import { describe, expect, it } from 'vitest';

import type { Fragment, FragmentBlock } from '@inkbrick/engine';

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

  it('tables: each row is a paragraph, cells are separated by tabs', () => {
    expect(
      outline(
        parse('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td><b>2</b></td></tr></table>'),
      ),
    ).toEqual(['paragraph:A\tB', 'paragraph:1\t2']);
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
