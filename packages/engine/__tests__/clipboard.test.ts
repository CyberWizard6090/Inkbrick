import { describe, expect, it } from 'vitest';

import { createSchemaRegistry, deserializeDocument, type BlockId } from '@inkbrick/document';

import {
  Editor,
  fragmentToHtml,
  fragmentToPlainText,
  sanitizeFragment,
  type CaretResult,
  type Fragment,
} from '../src';

const p = (blockId: BlockId, offset: number) => ({ blockId, offset });

function setup(
  blocks: Array<[string, string, Record<string, unknown>?]> = [['block:paragraph', '']],
) {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids: BlockId[] = [editor.document.getBlock(noteId)!.children[0]];

  for (let i = 1; i < blocks.length; i++) {
    ids.push(
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
        }) as CaretResult
      ).blockId,
    );
  }

  blocks.forEach(([flavour, text, props], i) => {
    if (flavour !== 'block:paragraph')
      editor.dispatch({ type: 'convertBlock', payload: { blockId: ids[i], flavour, props } });
    if (text)
      editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } });
  });
  editor.clearHistory();

  const text = (id: BlockId) =>
    editor.engine.inline.toPlainText(editor.document.getBlock(id)?.content ?? []);
  const order = () => editor.document.getBlock(noteId)!.children;
  const flat = () =>
    order().map(
      (id) => `${editor.document.getBlock(id)!.flavour.replace('block:', '')}:${text(id)}`,
    );
  const paste = (at: { blockId: BlockId; offset: number }, fragment: Fragment) =>
    editor.dispatch({ type: 'pasteFragment', payload: { at, fragment } }) as
      CaretResult | undefined;

  return { editor, noteId, ids, text, order, flat, paste };
}

const block = (flavour: string, text: string, extra: Record<string, unknown> = {}) => ({
  flavour,
  props: {},
  content: text ? [{ insert: text }] : [],
  children: [],
  ...extra,
});

describe('copyFragment', () => {
  it('never carries block meta (authors, timestamps) into the fragment or its HTML', () => {
    const editor = new Editor({ meta: { now: () => 1234, user: () => 'alice@example.com' } });
    const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(noteId)!.children[0];
    const second = (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: first },
      }) as CaretResult
    ).blockId;

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: second, from: 0, to: 0, text: 'two' },
    });
    expect(editor.document.getBlock(second)!.meta?.createdBy).toBe('alice@example.com');

    const fragment = editor.copyFragment(p(first, 0), p(second, 3));
    const json = JSON.stringify(fragment);

    expect(fragment.blocks.length).toBeGreaterThan(0);
    expect(json).not.toContain('alice@example.com');
    expect(json).not.toContain('meta');
    expect(json).not.toContain('1234');
    expect(fragmentToHtml(fragment, json)).not.toContain('alice@example.com');
  });

  it('copies a partial selection inside one block as an incomplete block', () => {
    const { editor, ids } = setup([['block:heading', 'Hello world', { level: 2 }]]);

    const fragment = editor.copyFragment(p(ids[0], 6), p(ids[0], 11));

    expect(fragment.blocks).toEqual([
      {
        flavour: 'block:heading',
        props: { level: 2, align: 'left' },
        content: [{ insert: 'world' }],
        children: [],
        complete: false,
      },
    ]);
  });

  it('marks fully selected blocks as complete and keeps types, props and formatting', () => {
    const { editor, ids } = setup([
      ['block:paragraph', 'one'],
      ['block:list', 'two', { type: 'todo', checked: true }],
    ]);
    editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: ids[0], from: 0, to: 3, format: 'bold' },
    });

    const fragment = editor.copyFragment(p(ids[0], 0), p(ids[1], 3));

    expect(fragment.blocks.map((b) => [b.flavour, b.complete])).toEqual([
      ['block:paragraph', true],
      ['block:list', true],
    ]);
    expect(fragment.blocks[0].content).toEqual([{ insert: 'one', attributes: { bold: true } }]);
    expect(fragment.blocks[1].props).toEqual({ type: 'todo', checked: true });
  });

  it('keeps nesting when both parent and child are selected, and flattens orphans', () => {
    const { editor, ids } = setup([
      ['block:list', 'a', { type: 'bullet' }],
      ['block:list', 'b', { type: 'bullet' }],
      ['block:list', 'c', { type: 'bullet' }],
    ]);
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[1] } }); // b внутри a

    const all = editor.copyFragment(p(ids[0], 0), p(ids[2], 1));
    expect(
      all.blocks.map((b) => [b.content[0].insert, b.children.map((c) => c.content[0].insert)]),
    ).toEqual([
      ['a', ['b']],
      ['c', []],
    ]);

    const orphan = editor.copyFragment(p(ids[1], 0), p(ids[2], 1)); // родитель «a» не выделен
    expect(orphan.blocks.map((b) => b.content[0].insert)).toEqual(['b', 'c']);
  });

  it('includes dividers, skips unknown blocks, and returns nothing for a bare caret', () => {
    const { editor, noteId, ids } = setup([
      ['block:paragraph', 'top'],
      ['block:paragraph', 'bottom'],
    ]);
    const divider = editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[0], flavour: 'block:divider' },
    }) as CaretResult;
    editor.document._setBlock({
      id: 'u1',
      flavour: 'block:mystery',
      parentId: noteId,
      children: [],
      content: [{ insert: 'x' }],
      props: {},
    });
    editor.document._insertChild(noteId, 1, 'u1');

    const fragment = editor.copyFragment(p(ids[0], 0), p(ids[1], 6));

    // «top» непустой: он остаётся, разделитель и новый пустой параграф встают после него; неизвестный блок пропущен
    expect(
      fragment.blocks.map((b) => [b.flavour, b.content.map((c) => c.insert).join('')]),
    ).toEqual([
      ['block:paragraph', 'top'],
      ['block:divider', ''],
      ['block:paragraph', ''],
      ['block:paragraph', 'bottom'],
    ]);
    expect(fragment.blocks.some((b) => b.flavour === 'block:mystery')).toBe(false);
    expect(divider.blockId).toBeDefined();
    expect(editor.copyFragment(p(ids[1], 2), p(ids[1], 2)).blocks).toEqual([]);
    expect(editor.copyFragment(p('nope', 0), p(ids[1], 2)).blocks).toEqual([]);
  });
});

describe('serialization', () => {
  const fragment: Fragment = {
    blocks: [
      block('block:heading', 'Title', { props: { level: 2 } }),
      block('block:paragraph', '', {
        content: [
          { insert: 'a ' },
          { insert: 'b', attributes: { bold: true, italic: true } },
          { insert: ' ' },
          { insert: 'link', attributes: { link: 'https://x.org/?a=1&b=2' } },
        ],
      }),
      block('block:list', 'one', {
        props: { type: 'bullet' },
        children: [block('block:list', 'nested', { props: { type: 'bullet' } })],
      }),
      block('block:list', 'two', { props: { type: 'bullet' } }),
      block('block:list', 'step', { props: { type: 'ordered' } }),
      block('block:list', 'task', { props: { type: 'todo', checked: true } }),
      block('block:quote', 'quote'),
      block('block:code', 'let a = 1;\nlet b = 2;', { props: { language: 'ts' } }),
      block('block:divider', ''),
    ],
  };

  it('produces semantic HTML with formatting, lists, code and dividers', () => {
    const html = fragmentToHtml(fragment);

    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<em><strong>b</strong></em>');
    expect(html).toContain('<a href="https://x.org/?a=1&amp;b=2">link</a>');
    expect(html).toContain('<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>');
    expect(html).toContain('<ol><li>step</li></ol>');
    expect(html).toContain('<input type="checkbox" disabled checked>');
    expect(html).toContain('<blockquote>quote</blockquote>');
    expect(html).toContain('<pre><code class="language-ts">let a = 1;\nlet b = 2;</code></pre>');
    expect(html).toContain('<hr>');
  });

  it('escapes text and never emits unsafe links', () => {
    const html = fragmentToHtml({
      blocks: [
        block('block:paragraph', '', {
          content: [
            { insert: '<script>alert(1)</script> & "q"' },
            { insert: 'x', attributes: { link: 'javascript:alert(1)' } },
          ],
        }),
      ],
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
  });

  it('embeds the exact fragment when asked, safely quoted', () => {
    const html = fragmentToHtml({ blocks: [block('block:paragraph', 'x')] }, '{"a":"\\"><b>"}');

    expect(
      html.startsWith(
        '<div data-inkbrick-fragment="{&quot;a&quot;:&quot;\\&quot;&gt;&lt;b&gt;&quot;}">',
      ),
    ).toBe(true);
  });

  it('plain text: one line per block, nested blocks indented, dividers skipped', () => {
    expect(fragmentToPlainText(fragment).split('\n').slice(0, 5)).toEqual([
      'Title',
      'a b link',
      'one',
      '  nested',
      'two',
    ]);
    expect(fragmentToPlainText(fragment)).not.toContain('\n\n');
  });
});

describe('sanitizeFragment', () => {
  it('accepts valid fragments and keeps known attributes', () => {
    const result = sanitizeFragment({
      blocks: [
        {
          flavour: 'block:paragraph',
          props: {},
          content: [
            { insert: 'x', attributes: { bold: true, link: 'https://a.b', color: '#ff0000' } },
          ],
          children: [],
          complete: true,
        },
      ],
    })!;

    expect(result.blocks[0].content).toEqual([
      { insert: 'x', attributes: { bold: true, link: 'https://a.b', color: '#ff0000' } },
    ]);
    expect(result.blocks[0].complete).toBe(true);
  });

  it('drops unknown/unsafe attributes and malformed nodes', () => {
    const result = sanitizeFragment({
      blocks: [
        {
          flavour: 'block:paragraph',
          content: [
            {
              insert: 'a',
              attributes: {
                bold: 'yes',
                link: 'javascript:alert(1)',
                onclick: 'x',
                color: 'url(javascript:1)',
                __proto__: { polluted: true },
              },
            },
            { insert: 5 },
            'text',
            { insert: '' },
          ],
        },
      ],
    })!;

    expect(result.blocks[0].content).toEqual([{ insert: 'a' }]);
    expect(result.blocks[0].children).toEqual([]);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('rejects non-fragments', () => {
    for (const input of [
      null,
      undefined,
      'x',
      5,
      [],
      {},
      { blocks: 'x' },
      { blocks: [] },
      { blocks: [null, 5, { flavour: '' }] },
    ]) {
      expect(sanitizeFragment(input)).toBeNull();
    }
  });

  it('limits depth and size', () => {
    let deep: any = block('block:paragraph', 'x');
    for (let i = 0; i < 40; i++) deep = block('block:list', 'x', { children: [deep] });

    const result = sanitizeFragment({ blocks: [deep] })!;
    let depth = 0;
    for (let node: any = result.blocks[0]; node.children.length; node = node.children[0]) depth++;
    expect(depth).toBeLessThanOrEqual(12);

    const many = { blocks: Array.from({ length: 6000 }, () => block('block:paragraph', 'x')) };
    expect(sanitizeFragment(many)).toBeNull();
    expect(
      sanitizeFragment({ blocks: [block('block:paragraph', 'x'.repeat(2_100_000))] }),
    ).toBeNull();
  });
});

describe('pasteFragment', () => {
  it('a single text block is merged into the current block with its formatting', () => {
    const { editor, ids, text, flat, paste } = setup([['block:paragraph', 'Hello world']]);

    const caret = paste(p(ids[0], 6), {
      blocks: [
        {
          ...block('block:paragraph', ''),
          content: [{ insert: 'big ', attributes: { bold: true } }],
        },
      ],
    })!;

    expect(flat()).toEqual(['paragraph:Hello big world']);
    expect(caret).toEqual(p(ids[0], 10));
    expect(editor.document.getBlock(ids[0])!.content[1]).toEqual({
      insert: 'big ',
      attributes: { bold: true },
    });
    expect(text(ids[0])).toBe('Hello big world');
  });

  it('several blocks split the current one: head + first, middle blocks, last + tail', () => {
    const { ids, flat, paste, order } = setup([['block:paragraph', 'Hello world']]);

    const caret = paste(p(ids[0], 5), {
      blocks: [
        block('block:paragraph', 'A'),
        block('block:heading', 'B', { props: { level: 2 } }),
        block('block:quote', 'C'),
      ],
    })!;

    expect(flat()).toEqual(['paragraph:HelloA', 'heading:B', 'quote:C world']);
    expect(caret.blockId).toBe(order()[2]);
    expect(caret.offset).toBe(1);
  });

  it('an empty block adopts the type of a completely copied first block', () => {
    const { editor, ids, flat, paste } = setup([['block:paragraph', '']]);

    paste(p(ids[0], 0), {
      blocks: [block('block:heading', 'Title', { props: { level: 2 }, complete: true })],
    });

    expect(flat()).toEqual(['heading:Title']);
    expect(editor.document.getBlock(ids[0])!.props).toEqual({ level: 2, align: 'left' });
  });

  it('a partially copied block never changes the type of an empty block', () => {
    const { ids, flat, paste } = setup([['block:paragraph', '']]);

    paste(p(ids[0], 0), {
      blocks: [block('block:heading', 'word', { props: { level: 2 }, complete: false })],
    });

    expect(flat()).toEqual(['paragraph:word']);
  });

  it('keeps the current block type for non-empty targets', () => {
    const { ids, flat, paste } = setup([['block:list', 'item', { type: 'bullet' }]]);

    paste(p(ids[0], 4), {
      blocks: [
        block('block:heading', ' more', { props: { level: 1 }, complete: true }),
        block('block:paragraph', 'next'),
      ],
    });

    expect(flat()).toEqual(['list:item more', 'paragraph:next']);
  });

  it('keeps nested blocks of the fragment', () => {
    const { editor, ids, order, paste } = setup([['block:paragraph', '']]);

    paste(p(ids[0], 0), {
      blocks: [
        block('block:list', 'a', {
          props: { type: 'bullet' },
          complete: true,
          children: [block('block:list', 'a1', { props: { type: 'bullet' } })],
        }),
      ],
    });

    const [first] = order();
    expect(editor.document.getBlock(first)!.flavour).toBe('block:list');
    const children = editor.document.getBlock(first)!.children;
    expect(children.length).toBe(1);
    expect(editor.engine.inline.toPlainText(editor.document.getBlock(children[0])!.content)).toBe(
      'a1',
    );
  });

  it('degrades unknown flavours and invalid props instead of dropping the content', () => {
    const { editor, ids, flat, paste, order } = setup([['block:paragraph', 'x']]);

    paste(p(ids[0], 1), {
      blocks: [
        block('block:paragraph', 'a'),
        block('block:mystery', 'unknown', { props: { z: 1 } }),
        block('block:heading', 'h', { props: { level: 99 } }),
      ],
    });

    expect(flat()).toEqual(['paragraph:xa', 'paragraph:unknown', 'heading:h']);
    expect(editor.document.getBlock(order()[2])!.props).toEqual({ level: 1, align: 'left' });
  });

  it('pasting into a list item keeps siblings at the same level (types that do not fit become paragraphs)', () => {
    const { editor, ids, order, paste } = setup([
      ['block:list', 'a', { type: 'bullet' }],
      ['block:list', 'b', { type: 'bullet' }],
    ]);
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[1] } });

    paste(p(ids[1], 1), {
      blocks: [block('block:paragraph', '1'), block('block:heading', '2', { props: { level: 1 } })],
    });

    const children = editor.document.getBlock(ids[0])!.children;
    expect(children.length).toBe(2);
    expect(order()).toEqual([ids[0]]);
    expect(editor.document.getBlock(children[1])!.flavour).toBe('block:paragraph');
  });

  it('a divider in the middle of text splits it; in an empty block it replaces it', () => {
    const a = setup([['block:paragraph', 'headtail']]);

    a.paste(p(a.ids[0], 4), { blocks: [block('block:divider', '')] });
    expect(a.flat()).toEqual(['paragraph:head', 'divider:', 'paragraph:tail']);

    const b = setup([['block:paragraph', '']]);
    const caret = b.paste(p(b.ids[0], 0), {
      blocks: [block('block:divider', '', { complete: true })],
    })!;

    expect(b.flat()).toEqual(['divider:', 'paragraph:']);
    expect(caret.blockId).toBe(b.order()[1]);
  });

  it('text blocks around a divider keep their boundaries merged with head and tail', () => {
    const { ids, flat, paste } = setup([['block:paragraph', 'ABCD']]);

    paste(p(ids[0], 2), {
      blocks: [
        block('block:paragraph', '1'),
        block('block:divider', ''),
        block('block:paragraph', '2'),
      ],
    });

    expect(flat()).toEqual(['paragraph:AB1', 'divider:', 'paragraph:2CD']);
  });

  it('existing children of the target follow the tail', () => {
    const { editor, ids, order, paste } = setup([
      ['block:list', 'ab', { type: 'bullet' }],
      ['block:list', 'child', { type: 'bullet' }],
    ]);
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[1] } });

    paste(p(ids[0], 1), {
      blocks: [
        block('block:list', 'X', { props: { type: 'bullet' } }),
        block('block:list', 'Y', { props: { type: 'bullet' } }),
      ],
    });

    const [first, second] = order();
    expect(editor.document.getBlock(first)!.children).toEqual([]);
    expect(editor.document.getBlock(second)!.children).toEqual([ids[1]]);
  });

  it('is atomic: one undo step restores the document', () => {
    const { editor, ids, paste } = setup([['block:paragraph', 'Hello world']]);
    const before = structuredClone(editor.document.dump());
    editor.sealHistory();

    paste(p(ids[0], 5), {
      blocks: [block('block:paragraph', 'A'), block('block:heading', 'B', { props: { level: 2 } })],
    });
    editor.undo();

    expect(editor.document.dump()).toEqual(before);
  });

  it('refuses code targets, empty fragments, missing blocks and read-only mode', () => {
    const { editor, ids, paste } = setup([['block:code', 'code']]);

    expect(paste(p(ids[0], 1), { blocks: [block('block:paragraph', 'x')] })).toBeUndefined();
    expect(paste(p('nope', 0), { blocks: [block('block:paragraph', 'x')] })).toBeUndefined();

    const other = setup([['block:paragraph', 'x']]);
    expect(other.paste(p(other.ids[0], 0), { blocks: [] })).toBeUndefined();

    other.editor.setReadOnly(true);
    expect(
      other.paste(p(other.ids[0], 0), { blocks: [block('block:paragraph', 'y')] }),
    ).toBeUndefined();
    expect(editor.document.getBlock(ids[0])!.flavour).toBe('block:code');
  });

  it('round trip between editors: a copy pasted elsewhere reproduces types, props and formatting', () => {
    const src = setup([
      ['block:heading', 'Title', { level: 2 }],
      ['block:list', 'item', { type: 'todo', checked: true }],
    ]);
    src.editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: src.ids[1], from: 0, to: 4, format: 'italic' },
    });

    const fragment = sanitizeFragment(
      JSON.parse(JSON.stringify(src.editor.copyFragment(p(src.ids[0], 0), p(src.ids[1], 4)))),
    )!;

    const dst = setup([['block:paragraph', '']]);
    dst.paste(p(dst.ids[0], 0), fragment);

    expect(dst.flat()).toEqual(['heading:Title', 'list:item']);
    expect(dst.editor.document.getBlock(dst.order()[1])!.props).toEqual({
      type: 'todo',
      checked: true,
    });
    expect(dst.editor.document.getBlock(dst.order()[1])!.content).toEqual([
      { insert: 'item', attributes: { italic: true } },
    ]);
  });

  it('a block missing from the destination schema survives as a paragraph; serialization stays valid', () => {
    const dst = setup([['block:paragraph', '']]);

    dst.paste(p(dst.ids[0], 0), {
      blocks: [block('block:widget', 'note', { props: { tone: 'warn' }, complete: true })],
    });

    expect(dst.flat()).toEqual(['paragraph:note']);

    const schema = createSchemaRegistry();
    const restored = deserializeDocument(dst.editor.serialize(), { schema });
    expect(restored.getBlock(dst.ids[0])).toBeDefined();
  });
});
