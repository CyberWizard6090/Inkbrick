import { describe, expect, it } from 'vitest';

import { validateSnapshot } from '@inkbrick/document';
import { Editor, columnsBlocks, type CaretResult } from '../src/internal';

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

describe('dragging blocks into columns and back', () => {
  const move = (editor: Editor, blockId: string, targetId: string, position: 'before' | 'after') =>
    editor.dispatch({ type: 'moveBlock', payload: { blockId, targetId, position } });

  it('a block goes into columns and comes back: the document is as before', () => {
    const { editor, ids, side, shape, valid } = setup(['a', 'b', 'c']);

    side(ids[2], ids[0], 'right');
    expect(shape()).toEqual([[['a'], ['c']], 'b']);

    move(editor, ids[2], ids[1], 'after');

    expect(shape()).toEqual(['a', 'b', 'c']);
    expect(valid()).toEqual([]);
  });

  it('both blocks leave the columns one after another', () => {
    const { editor, ids, side, shape, valid } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');
    move(editor, ids[0], ids[2], 'after');

    expect(shape()).toEqual(['b', 'c', 'a']);
    expect(valid()).toEqual([]);
  });

  it('three columns shrink to two and then unwrap as blocks are taken out', () => {
    const { editor, ids, side, shape, valid } = setup(['a', 'b', 'c', 'd']);

    side(ids[1], ids[0], 'right');
    side(ids[2], ids[1], 'right');
    expect(shape()).toEqual([[['a'], ['b'], ['c']], 'd']);

    move(editor, ids[1], ids[3], 'after');
    expect(shape()).toEqual([[['a'], ['c']], 'd', 'b']);
    expect(valid()).toEqual([]);

    move(editor, ids[2], ids[3], 'before');
    expect(shape()).toEqual(['a', 'c', 'd', 'b']);
    expect(valid()).toEqual([]);
  });

  it('a column with several blocks stays when one of them leaves', () => {
    const { editor, ids, side, shape, valid } = setup(['a', 'b', 'c', 'd']);

    side(ids[1], ids[0], 'right');
    move(editor, ids[2], ids[0], 'after');
    expect(shape()).toEqual([[['a', 'c'], ['b']], 'd']);

    move(editor, ids[2], ids[3], 'after');

    expect(shape()).toEqual([[['a'], ['b']], 'd', 'c']);
    expect(valid()).toEqual([]);
  });

  it('a block moves from one column into another; its emptied column goes', () => {
    const { editor, ids, side, shape, valid } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');
    side(ids[2], ids[1], 'right');
    move(editor, ids[2], ids[0], 'after');

    expect(shape()).toEqual([[['a', 'c'], ['b']]]);
    expect(valid()).toEqual([]);
  });

  it('a block moves to the side of a block in another column of the same layout', () => {
    const { ids, side, shape, valid } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');
    side(ids[2], ids[1], 'right');
    side(ids[2], ids[0], 'left');

    expect(shape()).toEqual([[['c'], ['a'], ['b']]]);
    expect(valid()).toEqual([]);
  });

  it('every step of the round trip is one undo step, and redo repeats it', () => {
    const { editor, ids, side, shape } = setup(['a', 'b', 'c']);

    side(ids[2], ids[0], 'right');
    editor.sealHistory();
    move(editor, ids[2], ids[1], 'after');
    expect(shape()).toEqual(['a', 'b', 'c']);

    editor.store.undo();
    expect(shape()).toEqual([[['a'], ['c']], 'b']);
    editor.store.undo();
    expect(shape()).toEqual(['a', 'b', 'c']);

    editor.store.redo();
    expect(shape()).toEqual([[['a'], ['c']], 'b']);
    editor.store.redo();
    expect(shape()).toEqual(['a', 'b', 'c']);
  });

  it('undo brings back the removed column with its share', () => {
    const { editor, ids, side, get, noteId } = setup(['a', 'b', 'c', 'd']);

    side(ids[1], ids[0], 'right');
    side(ids[2], ids[1], 'right');

    const columnsId = get(noteId).children[0];

    editor.dispatch({
      type: 'setColumnRatios',
      payload: { blockId: columnsId, ratios: [1, 2, 1] },
    } as never);
    editor.sealHistory();
    move(editor, ids[1], ids[3], 'after');
    expect(get(columnsId).props.ratios).toEqual([0.25, 0.25]);

    editor.store.undo();
    expect(get(columnsId).props.ratios).toEqual([0.25, 0.5, 0.25]);
  });

  it('the whole columns block moves as one and keeps its columns', () => {
    const { editor, ids, side, shape, get, noteId, valid } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');
    move(editor, get(noteId).children[0], ids[2], 'after');

    expect(shape()).toEqual(['c', [['a'], ['b']]]);
    expect(valid()).toEqual([]);
  });

  it('a column itself cannot be moved out of its layout', () => {
    const { editor, ids, side, get } = setup(['a', 'b', 'c']);

    side(ids[1], ids[0], 'right');

    const column = get(ids[0]).parentId!;

    // Колонку саму по себе не переносят: она часть блока колонок.
    expect(editor.can('moveBlock', { blockId: column, targetId: ids[2], position: 'after' })).toBe(
      false,
    );
  });
});
