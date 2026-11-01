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

  const order = () =>
    editor.document
      .getBlock(noteId)!
      .children.map((id) =>
        editor.engine.inline.toPlainText(editor.document.getBlock(id)!.content),
      );
  const move = (blockId: BlockId, targetId: BlockId, position: 'before' | 'after') =>
    editor.dispatch({ type: 'moveBlock', payload: { blockId, targetId, position } });

  return { editor, noteId, ids, order, move };
}

describe('moveBlock', () => {
  it('moves a block before / after a target (index math is correct in both directions)', () => {
    const { ids, order, move } = setup(['a', 'b', 'c', 'd']);

    move(ids[0], ids[2], 'after'); // вперёд
    expect(order()).toEqual(['b', 'c', 'a', 'd']);

    move(ids[3], ids[1], 'before'); // назад
    expect(order()).toEqual(['d', 'b', 'c', 'a']);

    move(ids[1], ids[0], 'before');
    expect(order()).toEqual(['d', 'c', 'b', 'a']);

    move(ids[2], ids[0], 'after');
    expect(order()).toEqual(['d', 'b', 'a', 'c']);
  });

  it('moving next to itself or to the same spot keeps the order', () => {
    const { ids, order, move } = setup(['a', 'b', 'c']);

    expect(move(ids[1], ids[1], 'before')).toBeUndefined();
    move(ids[1], ids[0], 'after'); // уже там
    expect(order()).toEqual(['a', 'b', 'c']);
  });

  it('carries nested children along and can move into another parent', () => {
    const { editor, ids, order, move } = setup(['a', 'b', 'c']);

    for (const id of ids)
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: id, flavour: 'block:list', props: { type: 'bullet' } },
      });
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[1] } }); // b внутри a

    move(ids[1], ids[2], 'after'); // b выходит из a и встаёт после c

    expect(order()).toEqual(['a', 'c', 'b']);
    expect(editor.document.getBlock(ids[0])!.children).toEqual([]);

    move(ids[2], ids[1], 'before'); // c — внутрь a? цель b на верхнем уровне → c рядом с b, порядок: a, c, b
    expect(order()).toEqual(['a', 'c', 'b']);

    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[2] } });
    move(ids[1], ids[2], 'before');
    expect(editor.document.getBlock(ids[1])!.parentId).toBe(ids[0]);
    expect(editor.document.getBlock(ids[0])!.children).toEqual([ids[1], ids[2]]);
  });

  it('refuses cycles, structural blocks and invalid relations', () => {
    const { editor, noteId, ids, move } = setup(['a', 'b']);
    const before = structuredClone(editor.document.dump());

    for (const id of ids)
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: id, flavour: 'block:list', props: { type: 'bullet' } },
      });
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[1] } }); // b внутри a
    const nested = structuredClone(editor.document.dump());

    expect(move(ids[0], ids[1], 'after')).toBeUndefined(); // в собственного потомка
    expect(move(noteId, ids[0], 'before')).toBeUndefined(); // заметка — структура документа
    expect(move(ids[0], noteId, 'after')).toBeUndefined(); // рядом с заметкой (на уровне страницы)
    expect(move(ids[0], 'nope', 'after')).toBeUndefined();
    expect(editor.document.dump()).toEqual(nested);
    expect(before).not.toEqual(nested);
  });

  it('is one undo step', () => {
    const { editor, ids, order, move } = setup(['a', 'b', 'c']);

    move(ids[0], ids[2], 'after');
    expect(order()).toEqual(['b', 'c', 'a']);

    editor.undo();
    expect(order()).toEqual(['a', 'b', 'c']);
  });

  it('can() answers without changing the document', () => {
    const { editor, ids, order } = setup(['a', 'b']);
    const before = structuredClone(editor.document.dump());

    expect(editor.can('moveBlock', { blockId: ids[0], targetId: ids[1], position: 'after' })).toBe(
      true,
    );
    expect(editor.can('moveBlock', { blockId: ids[0], targetId: ids[0], position: 'after' })).toBe(
      false,
    );
    expect(editor.can('nope')).toBe(false);
    expect(editor.document.dump()).toEqual(before);
    expect(order()).toEqual(['a', 'b']);
    expect(editor.canUndo).toBe(false);
  });
});

describe('duplicateBlock', () => {
  it('copies a block with new ids right after the original', () => {
    const { editor, noteId, ids, order } = setup(['a', 'b']);

    editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: ids[0], from: 0, to: 1, format: 'bold' },
    });
    const caret = editor.dispatch({
      type: 'duplicateBlock',
      payload: { blockId: ids[0] },
    }) as CaretResult;

    expect(order()).toEqual(['a', 'a', 'b']);
    expect(caret.blockId).not.toBe(ids[0]);
    expect(editor.document.getBlock(noteId)!.children[1]).toBe(caret.blockId);
    expect(editor.document.getBlock(caret.blockId)!.content).toEqual([
      { insert: 'a', attributes: { bold: true } },
    ]);

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: caret.blockId, from: 1, to: 1, text: '!' },
    });
    expect(editor.engine.inline.toPlainText(editor.document.getBlock(ids[0])!.content)).toBe('a');
  });

  it('copies the whole subtree and keeps props', () => {
    const { editor, ids, order } = setup(['a', 'b']);

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[0], flavour: 'block:list', props: { type: 'ordered' } },
    });
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[1], flavour: 'block:list', props: { type: 'ordered' } },
    });
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[1] } });

    const copy = (
      editor.dispatch({ type: 'duplicateBlock', payload: { blockId: ids[0] } }) as CaretResult
    ).blockId;
    const copied = editor.document.getBlock(copy)!;

    expect(copied.props).toEqual({ type: 'ordered' });
    expect(copied.children.length).toBe(1);
    expect(copied.children[0]).not.toBe(ids[1]);
    expect(editor.document.getBlock(copied.children[0])!.parentId).toBe(copy);
    expect(order()).toEqual(['a', 'a']);
  });

  it('refuses unknown subtrees, structural blocks, and is one undo step', () => {
    const { editor, noteId, ids, order } = setup(['a']);

    expect(
      editor.dispatch({ type: 'duplicateBlock', payload: { blockId: noteId } }),
    ).toBeUndefined();

    editor.document._setBlock({
      id: 'u1',
      flavour: 'block:mystery',
      parentId: ids[0],
      children: [],
      content: [],
      props: {},
    });
    editor.document._insertChild(ids[0], 0, 'u1');
    expect(editor.can('duplicateBlock', { blockId: ids[0] })).toBe(false);
    editor.document._removeChild(ids[0], 'u1');
    editor.document._deleteBlock('u1');

    editor.dispatch({ type: 'duplicateBlock', payload: { blockId: ids[0] } });
    expect(order()).toEqual(['a', 'a']);
    editor.undo();
    expect(order()).toEqual(['a']);
  });
});

describe('delete-block', () => {
  it('leaves an empty paragraph when the last block of the note is deleted', () => {
    const { editor, noteId, ids } = setup(['only']);

    editor.execute('delete-block', { id: ids[0] });

    const children = editor.document.getBlock(noteId)!.children;
    expect(children.length).toBe(1);
    expect(children[0]).not.toBe(ids[0]);
    expect(editor.document.getBlock(children[0])!.flavour).toBe('block:paragraph');
    expect(editor.document.getBlock(children[0])!.content).toEqual([]);
  });

  it('deletes a middle block normally', () => {
    const { editor, ids, order } = setup(['a', 'b', 'c']);

    editor.execute('delete-block', { id: ids[1] });

    expect(order()).toEqual(['a', 'c']);
  });
});
