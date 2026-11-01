import { describe, expect, it } from 'vitest';

import type { BlockId } from '@inkbrick/document';

import { Editor, type CaretResult } from '../src';

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
