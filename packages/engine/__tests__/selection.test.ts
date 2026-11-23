import { describe, expect, it, vi } from 'vitest';

import { Editor, tableFeature, tableCellAt, type SelectionState } from '../src/internal';

function setup() {
  const editor = new Editor({ features: [tableFeature] });
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const first = editor.document.getBlock(note)!.children[0];

  editor.dispatch({
    type: 'replaceText',
    payload: { blockId: first, from: 0, to: 0, text: 'hello' },
  });

  const second = editor.dispatch({
    type: 'insertBlock',
    payload: { flavour: 'block:paragraph', afterId: first },
  })!.blockId;

  editor.dispatch({
    type: 'replaceText',
    payload: { blockId: second, from: 0, to: 0, text: 'world' },
  });

  return { editor, first, second };
}

describe('editor.selection', () => {
  it('commands put the caret where they say; undo and redo too', () => {
    const { editor, first } = setup();

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 5, to: 5, text: '!' },
    });
    expect(editor.selection.get()).toEqual({
      type: 'text',
      anchor: { blockId: first, offset: 6 },
      focus: { blockId: first, offset: 6 },
    });
    expect(editor.selection.isCollapsed).toBe(true);

    editor.undo();
    expect(editor.selection.get()).toMatchObject({ anchor: { blockId: first, offset: 5 } });
  });

  it('a range is reported in document order whichever end moves', () => {
    const { editor, first, second } = setup();

    editor.selection.select({ blockId: second, offset: 2 }, { blockId: first, offset: 1 });

    expect(editor.selection.range()).toEqual({
      from: { blockId: first, offset: 1 },
      to: { blockId: second, offset: 2 },
    });
    expect(editor.selection.isCollapsed).toBe(false);
  });

  it('refuses points in missing blocks and clamps offsets past the text', () => {
    const { editor, first } = setup();

    expect(editor.selection.caret({ blockId: 'nope', offset: 0 })).toBe(false);
    expect(editor.selection.caret({ blockId: first, offset: 99 })).toBe(true);
    expect(editor.selection.get()).toMatchObject({ anchor: { blockId: first, offset: 5 } });
  });

  it('follows edits: a deleted block drops out, shortened text pulls the offset in', () => {
    const { editor, first, second } = setup();
    const seen: [SelectionState, string][] = [];

    editor.selection.selectBlocks([first, second]);
    editor.selection.subscribe((selection, origin) => seen.push([selection, origin]));

    editor.execute('delete-block', { id: second });
    expect(editor.selection.get()).toEqual({ type: 'blocks', ids: [first] });
    expect(seen.at(-1)![1]).toBe('document');

    editor.selection.caret({ blockId: first, offset: 5 });
    editor.dispatch({ type: 'deleteText', payload: { blockId: first, from: 2, to: 5 } });
    expect(editor.selection.get()).toMatchObject({ anchor: { offset: 2 } });
  });

  it('cells: a rectangle in a table, clamped when the table shrinks', () => {
    const { editor, first } = setup();
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: first },
    })!;
    let tableId = caret.blockId;

    while (editor.document.getBlock(tableId)!.flavour !== 'block:table')
      tableId = editor.document.getBlock(tableId)!.parentId!;

    expect(tableCellAt((id) => editor.document.getBlock(id), tableId, 2, 2)).toBeTruthy();
    editor.selection.selectCells(tableId, { row: 0, column: 0 }, { row: 2, column: 2 });

    const seen: [SelectionState, string][] = [];

    editor.selection.subscribe((selection, origin) => seen.push([selection, origin]));
    editor.execute('deleteTableRow', { blockId: tableId, index: 2 });

    // Сначала прямоугольник прижат к таблице (правка), затем команда ставит каретку, которую вернула.
    expect(seen[0]).toEqual([
      { type: 'cells', tableId, anchor: { row: 0, column: 0 }, head: { row: 1, column: 2 } },
      'document',
    ]);
    expect(seen.at(-1)![1]).toBe('command');
  });

  it('listeners hear each change once with its origin; setting the same selection is silent', () => {
    const { editor, first } = setup();
    const listener = vi.fn();

    editor.selection.subscribe(listener);
    editor.selection.caret({ blockId: first, offset: 1 });
    editor.selection.caret({ blockId: first, offset: 1 });
    editor.selection.clear();

    expect(listener.mock.calls.map(([, origin]) => origin)).toEqual(['api', 'api']);
    expect(editor.selection.get()).toBeNull();
  });
});
