import { describe, expect, it } from 'vitest';

import type { BlockId } from '@inkbrick/document';

import { Editor, type CaretResult } from '../src/internal';

function setup(texts: string[]) {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids: BlockId[] = [editor.document.getBlock(noteId)!.children[0]];

  for (let i = 1; i < texts.length; i++) {
    ids.push(
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
        }) as CaretResult
      ).blockId,
    );
  }
  texts.forEach((text, i) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } }),
  );
  editor.clearHistory();

  return { editor, ids };
}

const p = (blockId: BlockId, offset: number) => ({ blockId, offset });

describe('setInlineAttributes (links)', () => {
  it('sets a link on a range across blocks and removes it again', () => {
    const { editor, ids } = setup(['hello', 'world']);

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: p(ids[0], 2), to: p(ids[1], 3), attributes: { link: 'https://x.org' } },
    });

    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'he' },
      { insert: 'llo', attributes: { link: 'https://x.org' } },
    ]);
    expect(editor.document.getBlock(ids[1])!.content).toEqual([
      { insert: 'wor', attributes: { link: 'https://x.org' } },
      { insert: 'ld' },
    ]);

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: p(ids[0], 0), to: p(ids[1], 5), attributes: { link: undefined } },
    });

    expect(editor.document.getBlock(ids[0])!.content).toEqual([{ insert: 'hello' }]);
    expect(editor.document.getBlock(ids[1])!.content).toEqual([{ insert: 'world' }]);
  });

  it('refuses unsafe links and leaves the document untouched', () => {
    const { editor, ids } = setup(['hello']);
    const before = structuredClone(editor.document.dump());

    for (const link of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x']) {
      expect(
        editor.dispatch({
          type: 'setInlineAttributes',
          payload: { from: p(ids[0], 0), to: p(ids[0], 5), attributes: { link } },
        }),
      ).toBeUndefined();
    }

    expect(editor.document.dump()).toEqual(before);
  });

  it('ignores empty ranges and is a single undo step', () => {
    const { editor, ids } = setup(['abc', 'def']);

    expect(
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: { from: p(ids[0], 1), to: p(ids[0], 1), attributes: { link: '/x' } },
      }),
    ).toBeUndefined();

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: p(ids[0], 0), to: p(ids[1], 3), attributes: { link: '/x', color: 'red' } },
    });
    editor.undo();

    expect(editor.document.getBlock(ids[0])!.content).toEqual([{ insert: 'abc' }]);
    expect(editor.document.getBlock(ids[1])!.content).toEqual([{ insert: 'def' }]);
  });
});

describe('formatsAt', () => {
  it('reports only formats that cover the whole range', () => {
    const { editor, ids } = setup(['abc', 'def']);

    editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: ids[0], from: 0, to: 3, format: 'bold' },
    });

    expect(editor.formatsAt(p(ids[0], 0), p(ids[0], 3))).toMatchObject({
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      code: false,
    });
    expect(editor.formatsAt(p(ids[0], 0), p(ids[1], 2)).bold).toBe(false); // во втором блоке жирного нет
    expect(editor.formatsAt(p(ids[0], 1), p(ids[0], 2)).bold).toBe(true);
  });

  it('reports a link only when the whole range is one link', () => {
    const { editor, ids } = setup(['abc', 'def']);

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: p(ids[0], 0), to: p(ids[1], 3), attributes: { link: '/a' } },
    });
    expect(editor.formatsAt(p(ids[0], 0), p(ids[1], 3)).link).toBe('/a');

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: p(ids[1], 0), to: p(ids[1], 3), attributes: { link: '/b' } },
    });
    expect(editor.formatsAt(p(ids[0], 0), p(ids[1], 3)).link).toBeUndefined();
    expect(editor.formatsAt(p(ids[1], 0), p(ids[1], 3)).link).toBe('/b');
  });

  it('is all false for an empty or invalid range', () => {
    const { editor, ids } = setup(['abc']);

    expect(
      Object.values(editor.formatsAt(p(ids[0], 1), p(ids[0], 1)))
        .filter((value) => typeof value === 'boolean')
        .every((value) => value === false),
    ).toBe(true);
    expect(editor.formatsAt(p('nope', 0), p(ids[0], 1)).bold).toBe(false);
  });
});

describe('inline code takes no formatting except a link', () => {
  const toggle = (
    editor: Editor,
    from: ReturnType<typeof p>,
    to: ReturnType<typeof p>,
    format: string,
  ) => editor.dispatch({ type: 'toggleFormatRange', payload: { from, to, format } });

  it('turning text into code drops its bold, italic, colour and background, keeps the link', () => {
    const { editor, ids } = setup(['styled']);

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: {
        from: p(ids[0], 0),
        to: p(ids[0], 6),
        attributes: {
          bold: true,
          italic: true,
          underline: true,
          strike: true,
          color: 'red',
          backgroundColor: '#ff000088',
          link: 'https://x.org',
        },
      },
    });
    toggle(editor, p(ids[0], 0), p(ids[0], 6), 'code');

    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'styled', attributes: { link: 'https://x.org', code: true } },
    ]);
  });

  it('bold, colour and background are not applied to code, even to a part of it', () => {
    const { editor, ids } = setup(['useState']);

    toggle(editor, p(ids[0], 0), p(ids[0], 8), 'code');
    toggle(editor, p(ids[0], 3), p(ids[0], 6), 'bold');
    editor.dispatch({
      type: 'setInlineAttributes',
      payload: {
        from: p(ids[0], 0),
        to: p(ids[0], 8),
        attributes: { color: 'green', backgroundColor: 'yellow' },
      },
    });

    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'useState', attributes: { code: true } },
    ]);
    expect(editor.formatsAt(p(ids[0], 0), p(ids[0], 8))).toMatchObject({
      code: true,
      bold: false,
    });
  });

  it('a range of code and text toggles bold on the text only, and back off', () => {
    const { editor, ids } = setup(['call fn now']);

    toggle(editor, p(ids[0], 5), p(ids[0], 7), 'code');
    toggle(editor, p(ids[0], 0), p(ids[0], 11), 'bold');

    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'call ', attributes: { bold: true } },
      { insert: 'fn', attributes: { code: true } },
      { insert: ' now', attributes: { bold: true } },
    ]);
    // Код не мешает считать жирный включённым — повторное нажатие снимает его.
    expect(editor.formatsAt(p(ids[0], 0), p(ids[0], 11)).bold).toBe(true);

    toggle(editor, p(ids[0], 0), p(ids[0], 11), 'bold');

    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'call ' },
      { insert: 'fn', attributes: { code: true } },
      { insert: ' now' },
    ]);
  });

  it('typing inside code stays plain code', () => {
    const { editor, ids } = setup(['ab']);

    toggle(editor, p(ids[0], 0), p(ids[0], 2), 'code');
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: ids[0], from: 1, to: 1, text: 'x' },
    });

    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'axb', attributes: { code: true } },
    ]);
  });
});

describe('code blocks take no formatting (their colours come from syntax highlighting)', () => {
  function withCode() {
    const { editor, ids } = setup(['text']);
    const code = (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:code', afterId: ids[0] },
      }) as CaretResult
    ).blockId;

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: code, from: 0, to: 0, text: 'let a' },
    });

    return { editor, text: ids[0], code };
  }

  it('select all + a colour or highlight changes the text, not the code', () => {
    const { editor, text, code } = withCode();

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: {
        from: p(text, 0),
        to: p(code, 5),
        attributes: { color: 'red', backgroundColor: 'yellow', link: 'https://x.org' },
      },
    });

    expect(editor.document.getBlock(code)!.content).toEqual([{ insert: 'let a' }]);
    expect(editor.document.getBlock(text)!.content[0].attributes).toMatchObject({ color: 'red' });
  });

  it('bold over text and code toggles on the text and back off', () => {
    const { editor, text, code } = withCode();
    const toggle = () =>
      editor.dispatch({
        type: 'toggleFormatRange',
        payload: { from: p(text, 0), to: p(code, 5), format: 'bold' },
      });

    toggle();
    expect(editor.formatsAt(p(text, 0), p(code, 5)).bold).toBe(true);
    expect(editor.document.getBlock(code)!.content).toEqual([{ insert: 'let a' }]);

    toggle();
    expect(editor.document.getBlock(text)!.content).toEqual([{ insert: 'text' }]);
  });

  it('Ctrl+B inside a code block does nothing', () => {
    const { editor, code } = withCode();

    expect(editor.can('toggleFormat', { blockId: code, from: 0, to: 3, format: 'bold' })).toBe(
      false,
    );
  });

  it('turning formatted text into a code block drops the formatting', () => {
    const { editor, text } = withCode();

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { from: p(text, 0), to: p(text, 4), attributes: { color: 'red', bold: true } },
    });
    const caret = editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: text, flavour: 'block:code' },
    })!;
    const converted = editor.document.getBlock(caret.blockId)!;

    expect(converted.flavour).toBe('block:code');
    expect(converted.content).toEqual([{ insert: 'text' }]);
  });
});
