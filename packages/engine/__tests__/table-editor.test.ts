import { describe, expect, it } from 'vitest';

import { validateSnapshot } from '@inkbrick/document';

import { createTableEditor, tableIdOf, tableValue, tableCellAt } from '../src/internal';

const get = (editor: ReturnType<typeof createTableEditor>) => (id: string) =>
  editor.document.getBlock(id);

describe('createTableEditor', () => {
  it('starts as an empty 3×3 table, or with the given rows', () => {
    expect(tableValue(createTableEditor()).rows).toEqual([
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ]);

    const editor = createTableEditor({ rows: [['Name', 'Qty'], ['Apple']], widths: [100, null] });

    expect(tableValue(editor)).toMatchObject({
      rows: [
        ['Name', 'Qty'],
        ['Apple', ''],
      ],
      header: true,
      widths: [100, null],
    });
    expect(validateSnapshot(editor.serialize(), editor.schema)).toEqual([]);
  });

  it('holds only the table, with no history of its creation', () => {
    const editor = createTableEditor({ rows: [['a']] });
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];

    expect(editor.document.getBlock(note)!.children).toEqual([tableIdOf(editor)]);
    expect(editor.store.canUndo).toBe(false);
  });

  it('cannot lose the table: delete, convert, move and whole-document deletes change nothing', () => {
    const editor = createTableEditor({ rows: [['a', 'b']] });
    const tableId = tableIdOf(editor)!;
    const before = editor.serialize();

    for (const intent of [
      { type: 'delete-block', payload: { id: tableId } },
      { type: 'convertBlock', payload: { blockId: tableId, flavour: 'block:paragraph' } },
      { type: 'moveBlock', payload: { blockId: tableId, targetId: tableId, position: 'after' } },
    ]) {
      expect(() => editor.dispatch(intent as never)).not.toThrow();
    }

    expect(editor.serialize()).toEqual(before);
    expect(editor.store.canUndo).toBe(false);
  });

  it('still edits cells, rows and columns, with undo', () => {
    const editor = createTableEditor({ rows: [['a']] });
    const tableId = tableIdOf(editor)!;
    const cell = tableCellAt(get(editor), tableId, 0, 0)!;

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: cell, from: 1, to: 1, text: 'z' },
    });
    editor.dispatch({ type: 'insertTableRow', payload: { blockId: tableId, index: 1 } } as never);

    expect(tableValue(editor).rows).toEqual([['az'], ['']]);

    editor.store.undo();
    editor.store.undo();

    expect(tableValue(editor).rows).toEqual([['a']]);
  });

  it('can start with the first row and column kept in view', () => {
    const editor = createTableEditor({ rows: [['a', 'b']], freezeRow: true, freezeColumn: true });
    const table = editor.document.getBlock(tableIdOf(editor)!)!;

    expect(table.props).toMatchObject({ freezeRow: true, freezeColumn: true });
    expect(validateSnapshot(editor.serialize(), editor.schema)).toEqual([]);
  });

  it('can be unpinned', () => {
    const editor = createTableEditor();

    editor.pin(null);
    editor.dispatch({ type: 'delete-block', payload: { id: tableIdOf(editor)! } } as never);

    expect(tableIdOf(editor)).toBeUndefined();
  });
});
