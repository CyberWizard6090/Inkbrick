import { describe, expect, it } from 'vitest';

import { FORMULA_CHAR } from '@inkbrick/document';

import { Editor, footnoteBlocks } from '../src/internal';

function make() {
  const editor = new Editor({ blocks: footnoteBlocks });
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const id = editor.document.getBlock(note)!.children[0];

  editor.dispatch({ type: 'replaceText', payload: { blockId: id, from: 0, to: 0, text: 'ab' } });
  editor.dispatch({
    type: 'replaceText',
    payload: { blockId: id, from: 1, to: 1, text: FORMULA_CHAR, plain: true },
  });

  return { editor, id, note };
}

const range = (id: string, from: number, to: number) => ({
  from: { blockId: id, offset: from },
  to: { blockId: id, offset: to },
});

const can = (editor: Editor, id: string, from: number, to: number, footnote: unknown) =>
  editor.can('setInlineAttributes', {
    ...range(id, from, to),
    attributes: { footnote },
  } as never);

describe('footnote reference attribute', () => {
  it('can only be put on an object character and only with a valid code', () => {
    const { editor, id } = make();

    expect(can(editor, id, 1, 2, 'fn-1')).toBe(true);
    expect(can(editor, id, 0, 1, 'fn-1')).toBe(false);
    expect(can(editor, id, 0, 3, 'fn-1')).toBe(false);
    expect(can(editor, id, 1, 2, '')).toBe(false);
    expect(can(editor, id, 1, 2, 'a b')).toBe(false);
    expect(can(editor, id, 1, 2, '"><x>')).toBe(false);
    expect(can(editor, id, 1, 2, 'x'.repeat(65))).toBe(false);
    expect(can(editor, id, 1, 2, 5)).toBe(false);
  });

  it('is stored on the node and removed with its character', () => {
    const { editor, id } = make();

    editor.dispatch({
      type: 'setInlineAttributes',
      payload: { ...range(id, 1, 2), attributes: { footnote: 'fn-1' } },
    });

    expect(editor.document.getBlock(id)!.content).toEqual([
      { insert: 'a' },
      { insert: FORMULA_CHAR, attributes: { footnote: 'fn-1' } },
      { insert: 'b' },
    ]);

    editor.dispatch({ type: 'deleteText', payload: { blockId: id, from: 1, to: 2 } });
    expect(editor.document.getBlock(id)!.content).toEqual([{ insert: 'ab' }]);
  });
});

describe('footnote block', () => {
  it('is a text block in the note with a required code, available only when the set is plugged in', () => {
    const { editor, note } = make();

    expect(
      editor.can('insertBlock', {
        flavour: 'block:footnote',
        parentId: note,
        props: { id: 'fn-1' },
      } as never),
    ).toBe(true);
    const created = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:footnote', parentId: note, props: { id: 'fn-2' } },
    }) as { blockId: string };

    expect(
      editor.can('setBlockProps', { blockId: created.blockId, props: { id: 'bad id' } } as never),
    ).toBe(false);

    expect(new Editor().schema.hasBlock('block:footnote')).toBe(false);
  });
});
