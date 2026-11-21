import { describe, expect, it } from 'vitest';

import { validateSnapshot } from '@inkbrick/document';
import { Editor, columnsBlocks, type CaretResult } from '../src';

function setup(texts: string[]) {
  const editor = new Editor({ blocks: columnsBlocks });
  const get = (id: string) => editor.document.getBlock(id)!;
  const noteId = get(editor.document.rootId).children[0];
  const ids = [get(noteId).children[0]];

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

  const textOf = (id: string) => editor.engine.inline.toPlainText(get(id).content);
  const side = (blockId: string, targetId: string, to: 'left' | 'right') =>
    editor.dispatch({ type: 'moveBlockToSide', payload: { blockId, targetId, side: to } });
  const valid = () => validateSnapshot(editor.serialize(), editor.schema);
  /** Дерево заметки в виде вложенных массивов текстов: колонки — массивы. */
  const shape = (id: string = noteId): unknown[] =>
    get(id).children.map((childId) => {
      const child = get(childId);

      return child.flavour === 'block:columns' || child.flavour === 'block:column'
        ? shape(childId)
        : textOf(childId);
    });

  return { editor, get, noteId, ids, side, valid, shape, textOf };
}

describe('moveBlockToSide', () => {
  it('puts two blocks side by side, the dragged one on the chosen side, in one undo step', () => {
    const { editor, ids, side, shape, valid } = setup(['a', 'b', 'c']);

    side(ids[2], ids[0], 'right');

    expect(shape()).toEqual([[['a'], ['c']], 'b']);
    expect(valid()).toEqual([]);

    editor.store.undo();
    expect(shape()).toEqual(['a', 'b', 'c']);

    side(ids[2], ids[0], 'left');
    expect(shape()).toEqual([[['c'], ['a']], 'b']);
  });

  it('adds a column next to the target when it is already in a column', () => {
    const { ids, side, shape, valid } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');
    side(ids[2], ids[0], 'left');

    expect(shape()).toEqual([[['c'], ['a'], ['b']]]);
    expect(valid()).toEqual([]);
  });

  it('drops the column that lost its last block and unwraps when one column is left', () => {
    const { ids, side, shape, valid } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');
    expect(shape()).toEqual([[['a'], ['b']], 'c']);

    // «b» уходит из своей колонки к «c»: в блоке колонок остаётся одна колонка — он разворачивается.
    side(ids[1], ids[2], 'right');

    expect(shape()).toEqual(['a', [['c'], ['b']]]);
    expect(valid()).toEqual([]);
  });

  it('keeps the ratios of the columns it adds to', () => {
    const { editor, ids, side, get } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');

    const columnsId = get(ids[0]).parentId!;
    const blockId = get(columnsId).parentId!;

    editor.dispatch({
      type: 'setColumnRatios',
      payload: { blockId, ratios: [1, 3] },
    } as never);
    side(ids[2], ids[0], 'right');

    const ratios = get(blockId).props.ratios as number[];

    expect(ratios).toHaveLength(3);
    expect(ratios[0]).toBeCloseTo(0.25);
  });

  it('does not allow more than six columns, itself, or its own descendant', () => {
    const { editor, ids, side } = setup(['a', 'b', 'c', 'd', 'e', 'f', 'g']);

    for (let i = 1; i < 6; i++) side(ids[i], ids[0], 'right');

    expect(
      editor.can('moveBlockToSide', { blockId: ids[6], targetId: ids[0], side: 'right' }),
    ).toBe(false);
    expect(editor.can('moveBlockToSide', { blockId: ids[0], targetId: ids[0], side: 'left' })).toBe(
      false,
    );
    expect(
      editor.can('moveBlockToSide', { blockId: ids[6], targetId: ids[0], side: 'up' as never }),
    ).toBe(false);
  });

  it('moving the last block out of a column removes the column, with its share', () => {
    const { editor, ids, side, shape, get, noteId, valid } = setup(['a', 'b', 'c', 'd']);

    side(ids[1], ids[0], 'right');
    side(ids[2], ids[0], 'right');
    editor.dispatch({
      type: 'setColumnRatios',
      payload: { blockId: get(noteId).children[0], ratios: [2, 1, 1] },
    } as never);

    editor.dispatch({
      type: 'moveBlock',
      payload: { blockId: ids[1], targetId: ids[3], position: 'after' },
    });

    expect(shape()).toEqual([[['a'], ['c']], 'd', 'b']);
    expect(get(get(noteId).children[0]).props.ratios).toEqual([0.5, 0.25]);
    expect(valid()).toEqual([]);

    editor.store.undo();
    expect(shape()).toEqual([[['a'], ['c'], ['b']], 'd']);
  });

  it('moving a block out of a two-column layout unwraps the columns', () => {
    const { editor, ids, side, shape, valid } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');
    editor.dispatch({
      type: 'moveBlock',
      payload: { blockId: ids[1], targetId: ids[2], position: 'after' },
    });

    expect(shape()).toEqual(['a', 'c', 'b']);
    expect(valid()).toEqual([]);
  });

  it('is unavailable without the columns blocks', () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];
    const second = (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: first },
      }) as CaretResult
    ).blockId;

    expect(editor.can('moveBlockToSide', { blockId: second, targetId: first, side: 'left' })).toBe(
      false,
    );
  });
});
