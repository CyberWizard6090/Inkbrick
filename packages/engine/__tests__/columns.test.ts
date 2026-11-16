import { describe, expect, it } from 'vitest';

import {
  serializeDocument,
  toHtml,
  toMarkdown,
  toPlainText,
  validateSnapshot,
} from '@inkbrick/document';
import { Editor, columnsBlocks, type CaretResult } from '../src';

function setup() {
  const editor = new Editor({ blocks: columnsBlocks });
  const get = (id: string) => editor.document.getBlock(id)!;
  const noteId = get(editor.document.rootId).children[0];
  const first = get(noteId).children[0];
  const caret = editor.dispatch({
    type: 'insertBlock',
    payload: { flavour: 'block:columns', afterId: first },
  }) as CaretResult;
  const columnsId = get(get(caret.blockId).parentId!).parentId!;
  const columns = () => get(columnsId).children;
  const textOf = (id: string) => editor.engine.inline.toPlainText(get(id).content);
  const type = (blockId: string, text: string) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId, from: 0, to: 0, text } });
  const blocksOf = (columnId: string) => get(columnId).children;
  const run = (name: string, payload: Record<string, unknown> = {}) =>
    editor.dispatch({ type: name, payload: { blockId: columnsId, ...payload } } as never);
  const valid = () => validateSnapshot(editor.serialize(), editor.schema);

  return {
    editor,
    get,
    noteId,
    first,
    caret,
    columnsId,
    columns,
    textOf,
    type,
    blocksOf,
    run,
    valid,
  };
}

describe('columns', () => {
  it('insertBlock makes two columns with a paragraph each, as one undo step', () => {
    const { editor, columns, blocksOf, get, valid, caret, columnsId } = setup();

    expect(columns()).toHaveLength(2);
    expect(columns().map((id) => blocksOf(id).map((child) => get(child).flavour))).toEqual([
      ['block:paragraph'],
      ['block:paragraph'],
    ]);
    expect(get(caret.blockId).parentId).toBe(columns()[0]);
    expect(valid()).toEqual([]);

    editor.store.undo();
    expect(editor.document.getBlock(columnsId)).toBeUndefined();
  });

  it('the number of ratios sets the number of columns, at most six', () => {
    const editor = new Editor({ blocks: columnsBlocks });
    const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(noteId)!.children[0];
    const make = (ratios: number[]) => {
      const caret = editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:columns', afterId: first, props: { ratios } },
      }) as CaretResult;

      const column = editor.document.getBlock(caret.blockId)!.parentId!;

      return editor.document.getBlock(editor.document.getBlock(column)!.parentId!)!.children.length;
    };

    expect(make([1, 1, 1])).toBe(3);
    expect(make([1, 1, 1, 1, 1, 1, 1, 1])).toBe(6);
  });

  it('adds columns up to six and keeps the ratios', () => {
    const { columns, run, editor, columnsId } = setup();

    run('addColumn', { index: 2 });
    expect(columns()).toHaveLength(3);

    run('setColumnRatios', { ratios: [1, 2, 1] });
    run('addColumn', { index: 1 });
    expect(editor.document.getBlock(columnsId)!.props.ratios).toEqual([
      0.25,
      expect.closeTo(1 / 3, 3),
      0.5,
      0.25,
    ]);

    run('addColumn', { index: 0 });
    run('addColumn', { index: 0 });
    expect(columns()).toHaveLength(6);
    expect(editor.can('addColumn', { blockId: columnsId, index: 0 })).toBe(false);
  });

  it('removing a column moves its blocks to the neighbour; the last two collapse into plain blocks', () => {
    const { run, columns, blocksOf, type, textOf, get, noteId, editor, columnsId } = setup();

    run('addColumn', { index: 2 });

    const [a, b, c] = columns();

    type(blocksOf(a)[0], 'A');
    type(blocksOf(b)[0], 'B');
    type(blocksOf(c)[0], 'C');

    run('removeColumn', { index: 1 });
    expect(columns()).toEqual([a, c]);
    expect(blocksOf(a).map(textOf)).toEqual(['A', 'B']);

    run('removeColumn', { index: 0 });
    expect(editor.document.getBlock(columnsId)).toBeUndefined();
    expect(
      get(noteId)
        .children.map(textOf)
        .filter((text) => text !== ''),
    ).toEqual(['A', 'B', 'C']);
  });

  it('unwrap puts all blocks back in order and removes the columns', () => {
    const { run, columns, blocksOf, type, textOf, get, noteId, editor, columnsId, valid } = setup();
    const [left, right] = columns();

    type(blocksOf(left)[0], 'left');
    type(blocksOf(right)[0], 'right');

    run('unwrapColumns');

    expect(editor.document.getBlock(columnsId)).toBeUndefined();
    expect(get(noteId).children.map(textOf)).toEqual(['', 'left', 'right']);
    expect(valid()).toEqual([]);
  });

  it('ratios are only kept when they differ, and must fit the columns', () => {
    const { run, editor, columnsId } = setup();

    run('setColumnRatios', { ratios: [1, 3] });
    expect(editor.document.getBlock(columnsId)!.props.ratios).toEqual([0.25, 0.75]);

    run('setColumnRatios', { ratios: [2, 2] });
    expect(editor.document.getBlock(columnsId)!.props.ratios).toBeUndefined();

    expect(editor.can('setColumnRatios', { blockId: columnsId, ratios: [1] })).toBe(false);
    expect(editor.can('setColumnRatios', { blockId: columnsId, ratios: [1, 0] })).toBe(false);
    expect(editor.can('setColumnRatios', { blockId: columnsId, ratios: [1, Infinity] })).toBe(
      false,
    );
  });

  it('a column keeps a paragraph when its last block is deleted, and cannot be deleted or moved itself', () => {
    const { editor, columns, blocksOf, get } = setup();
    const [left] = columns();
    const only = blocksOf(left)[0];

    editor.dispatch({ type: 'delete-block', payload: { id: only } } as never);

    expect(blocksOf(left)).toHaveLength(1);
    expect(get(blocksOf(left)[0]).flavour).toBe('block:paragraph');
    expect(blocksOf(left)[0]).not.toBe(only);

    editor.dispatch({ type: 'delete-block', payload: { id: left } } as never);
    expect(columns()).toContain(left);
  });

  it('Backspace at the start of a column does not merge it into the previous column', () => {
    const { editor, columns, blocksOf, type, textOf } = setup();
    const [left, right] = columns();

    type(blocksOf(left)[0], 'left');
    type(blocksOf(right)[0], 'right');
    editor.dispatch({
      type: 'deleteBackward',
      payload: { blockId: blocksOf(right)[0], offset: 0 },
    });

    expect(textOf(blocksOf(left)[0])).toBe('left');
    expect(textOf(blocksOf(right)[0])).toBe('right');
  });

  it('a selection from one column into another is not deleted, but one around the whole block is', () => {
    const { editor, columns, blocksOf, type, first, columnsId, noteId, get } = setup();
    const [left, right] = columns();

    type(blocksOf(left)[0], 'left');
    type(blocksOf(right)[0], 'right');

    const across = {
      from: { blockId: blocksOf(left)[0], offset: 2 },
      to: { blockId: blocksOf(right)[0], offset: 2 },
    };

    expect(editor.can('deleteRange', across)).toBe(false);

    const after = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: columnsId },
    }) as CaretResult;

    editor.dispatch({
      type: 'deleteRange',
      payload: { from: { blockId: first, offset: 0 }, to: { blockId: after.blockId, offset: 0 } },
    });

    expect(editor.document.getBlock(columnsId)).toBeUndefined();
    expect(get(noteId).children.length).toBeGreaterThan(0);
  });

  it('exports as a plain sequence of blocks', () => {
    const { editor, columns, blocksOf, type } = setup();
    const [left, right] = columns();

    type(blocksOf(left)[0], 'left');
    type(blocksOf(right)[0], 'right');

    const options = { schema: editor.schema, title: false };

    expect(toPlainText(editor.document, options)).toBe('left\n\nright');
    expect(toMarkdown(editor.document, options).trim()).toBe('left\n\nright');
    expect(toHtml(editor.document, options)).toBe('<p></p>\n<p>left</p>\n<p>right</p>');
    expect(JSON.stringify(serializeDocument(editor.document, editor.schema))).toContain(
      'block:column',
    );
  });
});
