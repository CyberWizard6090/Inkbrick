import { describe, expect, it } from 'vitest';

import { isSafeImageUrl, normalizeLinkUrl } from '@inkbrick/document';

import { Editor, fragmentToHtml, fragmentToPlainText, type CaretResult } from '../src';

function setup() {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];
  const children = () => editor.document.getBlock(noteId)!.children;
  const flavours = () =>
    children().map((id) => editor.document.getBlock(id)!.flavour.replace('block:', ''));

  return { editor, noteId, firstId, children, flavours };
}

describe('isSafeImageUrl', () => {
  it('allows web, relative and raster data URLs', () => {
    for (const url of [
      'https://cdn.example.com/a.png?x=1',
      'http://x.y/z.jpg',
      '/uploads/a.webp',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/jpeg;base64,/9j/4AAQ',
      'DATA:IMAGE/GIF;BASE64,R0lGODlh',
    ]) {
      expect(isSafeImageUrl(url)).toBe(true);
    }
  });

  it('rejects scripts, svg, blobs, protocol-relative URLs and malformed values', () => {
    for (const url of [
      '',
      '   ',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html;base64,PGI+',
      'data:image/png;base64,@@@',
      'data:image/png,not-base64',
      'blob:https://x/1',
      '//evil.test/a.png',
      'ftp://x/a.png',
      'https://x/a b.png',
      'java\nscript:1',
      `data:image/png;base64,${'A'.repeat(8_000_001)}`,
    ]) {
      expect(isSafeImageUrl(url)).toBe(false);
    }
  });

  it('is stricter than link normalisation (a link may be mailto:, an image may not)', () => {
    expect(normalizeLinkUrl('mailto:me@x.org')).not.toBeNull();
    expect(isSafeImageUrl('mailto:me@x.org')).toBe(false);
  });
});

describe('image block', () => {
  it('has sensible defaults and no text', () => {
    const { editor } = setup();

    expect(editor.schema.createProps('block:image')).toEqual({
      src: '',
      alt: '',
      caption: '',
      width: 100,
      align: 'center',
    });
    expect(editor.schema.getBlockSchema('block:image')!.inline).toBe(false);
  });

  it('props are validated by the schema: unsafe src, width and align are rejected', () => {
    const { editor } = setup();

    expect(() =>
      editor.schema.createProps('block:image', { src: 'javascript:alert(1)' }),
    ).toThrow();
    expect(() =>
      editor.schema.createProps('block:image', { src: 'https://a.b/c.png', width: 5 }),
    ).toThrow();
    expect(() => editor.schema.createProps('block:image', { align: 'middle' })).toThrow();
    expect(
      editor.schema.createProps('block:image', {
        src: 'https://a.b/c.png',
        width: 50,
        align: 'left',
      }).width,
    ).toBe(50);
  });

  it('replaces an empty paragraph (convertBlock) and puts the caret in a new paragraph below', () => {
    const { editor, firstId, flavours, children } = setup();

    const caret = editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: firstId, flavour: 'block:image' },
    }) as CaretResult;

    expect(flavours()).toEqual(['image', 'paragraph']);
    expect(caret.blockId).toBe(children()[1]);
  });

  it('setBlockProps updates the image and refuses unsafe values without throwing', () => {
    const { editor, firstId } = setup();
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: firstId, flavour: 'block:image' },
    });

    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: firstId, props: { src: 'https://a.b/c.png', caption: 'Cap', width: 50 } },
    });
    expect(editor.document.getBlock(firstId)!.props).toMatchObject({
      src: 'https://a.b/c.png',
      caption: 'Cap',
      width: 50,
    });

    for (const props of [
      { src: 'javascript:alert(1)' },
      { src: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { width: 500 },
      { align: 'x' },
    ]) {
      expect(() =>
        editor.dispatch({ type: 'setBlockProps', payload: { blockId: firstId, props } }),
      ).not.toThrow();
      expect(
        editor.dispatch({ type: 'setBlockProps', payload: { blockId: firstId, props } }),
      ).toBeUndefined();
    }

    expect(editor.document.getBlock(firstId)!.props).toMatchObject({
      src: 'https://a.b/c.png',
      width: 50,
    });
  });

  it('text commands never touch an image; Backspace below it removes it, undoable', () => {
    const { editor, firstId, flavours, children } = setup();
    const next = (
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: firstId, flavour: 'block:image' },
      }) as CaretResult
    ).blockId;
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: next, from: 0, to: 0, text: 'below' },
    });

    expect(
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: firstId, from: 0, to: 0, text: 'x' },
      }),
    ).toBeUndefined();
    expect(
      editor.dispatch({ type: 'deleteBackward', payload: { blockId: firstId, offset: 0 } }),
    ).toBeUndefined();
    expect(
      editor.dispatch({ type: 'splitBlock', payload: { blockId: firstId, offset: 0 } }),
    ).toBeUndefined();

    editor.sealHistory();
    editor.dispatch({ type: 'deleteBackward', payload: { blockId: next, offset: 0 } });
    expect(flavours()).toEqual(['paragraph']);

    editor.undo();
    expect(flavours()).toEqual(['image', 'paragraph']);
    expect(children()[0]).toBe(firstId);
  });

  it('can be duplicated and moved like any block', () => {
    const { editor, firstId, flavours } = setup();
    const below = (
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: firstId, flavour: 'block:image' },
      }) as CaretResult
    ).blockId;
    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: firstId, props: { src: '/a.png', alt: 'A' } },
    });

    const copy = (
      editor.dispatch({ type: 'duplicateBlock', payload: { blockId: firstId } }) as CaretResult
    ).blockId;
    expect(editor.document.getBlock(copy)!.props).toMatchObject({ src: '/a.png', alt: 'A' });

    editor.dispatch({
      type: 'moveBlock',
      payload: { blockId: copy, targetId: below, position: 'after' },
    });
    expect(flavours()).toEqual(['image', 'paragraph', 'image']);
  });
});

describe('callout block', () => {
  it('has tones, optional icon and validates them', () => {
    const { editor } = setup();

    expect(editor.schema.createProps('block:callout')).toEqual({ tone: 'info' });
    expect(editor.schema.createProps('block:callout', { tone: 'danger', icon: '🔥' })).toEqual({
      tone: 'danger',
      icon: '🔥',
    });
    expect(() => editor.schema.createProps('block:callout', { tone: 'purple' })).toThrow();
  });

  it('is a text block: converts in place, keeps text, Enter continues it and Enter on an empty one leaves it', () => {
    const { editor, firstId, flavours } = setup();
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: firstId, from: 0, to: 0, text: 'note' },
    });

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: firstId, flavour: 'block:callout', props: { tone: 'warning' } },
    });
    expect(editor.document.getBlock(firstId)!.props).toEqual({ tone: 'warning' });

    const next = (
      editor.dispatch({
        type: 'splitBlock',
        payload: { blockId: firstId, offset: 4 },
      }) as CaretResult
    ).blockId;
    expect(flavours()).toEqual(['callout', 'callout']);
    expect(editor.document.getBlock(next)!.props).toEqual({ tone: 'warning' });

    editor.dispatch({ type: 'splitBlock', payload: { blockId: next, offset: 0 } });
    expect(flavours()).toEqual(['callout', 'paragraph']);
  });
});

describe('clipboard representation', () => {
  const image = (props: Record<string, unknown>) => ({
    flavour: 'block:image',
    props,
    content: [],
    children: [],
  });

  it('images become <figure> with escaped attributes; unsafe sources are dropped', () => {
    const html = fragmentToHtml({
      blocks: [
        image({ src: 'https://a.b/c.png?x=1&y="2"', alt: 'a "b" <c>', caption: 'Cap & co' }),
        image({ src: 'javascript:alert(1)', alt: 'evil' }),
        image({ src: '' }),
      ],
    });

    expect(html).toContain(
      '<figure><img src="https://a.b/c.png?x=1&amp;y=&quot;2&quot;" alt="a &quot;b&quot; &lt;c&gt;"><figcaption>Cap &amp; co</figcaption></figure>',
    );
    expect(html).not.toContain('javascript:');
    expect(html.match(/<figure>/g)).toHaveLength(1);
  });

  it('plain text uses the caption, then the alt text, and skips images without either', () => {
    expect(
      fragmentToPlainText({
        blocks: [
          image({ caption: 'Cap', alt: 'Alt' }),
          image({ alt: 'Only alt' }),
          image({ src: '/a.png' }),
          { flavour: 'block:paragraph', props: {}, content: [{ insert: 'text' }], children: [] },
        ],
      }),
    ).toBe('Cap\nOnly alt\ntext');
  });

  it('callouts become <aside data-callout> with a safe tone attribute', () => {
    const html = fragmentToHtml({
      blocks: [
        {
          flavour: 'block:callout',
          props: { tone: 'success' },
          content: [{ insert: 'ok' }],
          children: [],
        },
        {
          flavour: 'block:callout',
          props: { tone: '"><script>' },
          content: [{ insert: 'x' }],
          children: [],
        },
      ],
    });

    expect(html).toContain('<aside data-callout="success">ok</aside>');
    expect(html).toContain('<aside data-callout="info">x</aside>');
    expect(html).not.toContain('<script>');
  });
});

describe('history merge keys', () => {
  it('an insertion and a later update with the same key form one undo step', () => {
    const { editor, firstId, flavours } = setup();

    editor.batch(
      () =>
        editor.dispatch({
          type: 'convertBlock',
          payload: { blockId: firstId, flavour: 'block:image', props: { alt: 'a' } },
        }),
      { mergeKey: 'image:1' },
    );
    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: firstId, props: { src: '/a.png' }, mergeKey: 'image:1' },
    });

    editor.undo();
    expect(flavours()).toEqual(['paragraph']);
    expect(editor.canUndo).toBe(false);

    editor.redo();
    expect(editor.document.getBlock(firstId)!.props).toMatchObject({ src: '/a.png', alt: 'a' });
  });

  it('different keys stay separate steps', () => {
    const { editor, firstId } = setup();

    editor.batch(
      () =>
        editor.dispatch({
          type: 'convertBlock',
          payload: { blockId: firstId, flavour: 'block:image' },
        }),
      { mergeKey: 'k1' },
    );
    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: firstId, props: { src: '/a.png' }, mergeKey: 'k2' },
    });

    editor.undo();
    expect(editor.document.getBlock(firstId)!.props).toMatchObject({ src: '' });
    expect(editor.canUndo).toBe(true);
  });
});

describe('setBlockProps without changes', () => {
  it('is refused, so no empty history entries appear', () => {
    const { editor, firstId } = setup();
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: firstId, flavour: 'block:image', props: { alt: 'a' } },
    });
    editor.clearHistory();

    expect(
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: firstId, props: { alt: 'a' } },
      }),
    ).toBeUndefined();
    expect(
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: firstId, props: { width: 100, align: 'center' } },
      }),
    ).toBeUndefined();
    expect(editor.canUndo).toBe(false);

    editor.dispatch({ type: 'setBlockProps', payload: { blockId: firstId, props: { alt: 'b' } } });
    expect(editor.canUndo).toBe(true);
  });
});
