import { describe, expect, it } from 'vitest';

import {
  createSchemaRegistry,
  repairSnapshot,
  tableBlockSchemas,
  validateSnapshot,
  type BlockId,
} from '@inkbrick/document';

import {
  Editor,
  locateTableCell,
  tableBlocks,
  tableCellAt,
  tableSize,
  type CaretResult,
} from '../src';

function setup() {
  const editor = new Editor({ blocks: tableBlocks });
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];
  const get = (id: BlockId) => editor.document.getBlock(id)!;
  const getBlock = (id: BlockId) => editor.document.getBlock(id);

  const caret = editor.dispatch({
    type: 'insertBlock',
    payload: { flavour: 'block:table', afterId: firstId },
  }) as CaretResult;
  const tableId = locateTableCell(getBlock, caret.blockId)!.tableId;

  const cell = (row: number, column: number) => tableCellAt(getBlock, tableId, row, column)!;
  const text = (id: BlockId) => editor.engine.inline.toPlainText(get(id).content);
  const type = (blockId: BlockId, value: string, offset = 0) =>
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId, from: offset, to: offset, text: value },
    });
  /** Заполняет ячейки их координатами: «r0c0», «r0c1», … */
  const fill = () => {
    const { rows, columns } = tableSize(getBlock, tableId)!;

    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) type(cell(r, c), `r${r}c${c}`);
  };
  const grid = () =>
    get(tableId).children.map((rowId) => get(rowId).children.map((id) => text(id)));
  const run = (type_: string, payload: Record<string, unknown> = {}) =>
    editor.dispatch({ type: type_, payload: { blockId: tableId, ...payload } } as never);
  const valid = () => validateSnapshot(editor.serialize(), editor.schema);
  const noteChildren = () => get(noteId).children;

  return {
    editor,
    noteId,
    firstId,
    tableId,
    caret,
    cell,
    text,
    type,
    fill,
    grid,
    run,
    valid,
    get,
    getBlock,
    noteChildren,
  };
}

describe('table: creation', () => {
  it('is not built in: the default editor does not know it', () => {
    const editor = new Editor();

    expect(editor.schema.hasBlock('block:table')).toBe(false);
  });

  it('insertBlock creates a 3×3 table and puts the caret into the first cell', () => {
    const { getBlock, tableId, caret, cell, valid, noteChildren, firstId } = setup();

    expect(tableSize(getBlock, tableId)).toEqual({ rows: 3, columns: 3 });
    expect(caret).toEqual({ blockId: cell(0, 0), offset: 0 });
    expect(noteChildren()).toEqual([firstId, tableId]);
    expect(valid()).toEqual([]);
  });

  it('convertBlock turns an empty paragraph into a table followed by a paragraph', () => {
    const editor = new Editor({ blocks: tableBlocks });
    const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
    const firstId = editor.document.getBlock(noteId)!.children[0];
    const getBlock = (id: BlockId) => editor.document.getBlock(id);

    const caret = editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: firstId, flavour: 'block:table' },
    }) as CaretResult;
    const flavours = getBlock(noteId)!.children.map((id) => getBlock(id)!.flavour);

    expect(flavours).toEqual(['block:table', 'block:paragraph']);
    expect(locateTableCell(getBlock, caret.blockId)).toEqual({
      tableId: firstId,
      row: 0,
      column: 0,
    });

    editor.undo();
    expect(getBlock(noteId)!.children.map((id) => getBlock(id)!.flavour)).toEqual([
      'block:paragraph',
    ]);
  });

  it('creating a table is one undo step', () => {
    const { editor, noteChildren, firstId } = setup();

    editor.undo();
    expect(noteChildren()).toEqual([firstId]);
  });

  it('rows and cells cannot be inserted, deleted, moved or duplicated on their own', () => {
    const { editor, tableId, cell, get, firstId } = setup();
    const rowId = get(tableId).children[0];

    expect(editor.can('insertBlock', { flavour: 'block:table-cell', afterId: cell(0, 0) })).toBe(
      false,
    );
    expect(editor.can('insertBlock', { flavour: 'block:table-row', afterId: rowId })).toBe(false);
    expect(editor.can('insertBlock', { flavour: 'block:paragraph', afterId: cell(0, 0) })).toBe(
      false,
    );
    expect(editor.can('delete-block', { id: cell(0, 0) })).toBe(false);
    expect(editor.can('delete-block', { id: rowId })).toBe(false);
    expect(editor.can('duplicateBlock', { blockId: rowId })).toBe(false);
    expect(
      editor.can('moveBlock', { blockId: cell(0, 0), targetId: cell(1, 1), position: 'after' }),
    ).toBe(false);
    expect(
      editor.can('moveBlock', { blockId: firstId, targetId: cell(1, 1), position: 'after' }),
    ).toBe(false);
    expect(editor.can('convertBlock', { blockId: cell(0, 0), flavour: 'block:heading' })).toBe(
      false,
    );
    expect(editor.can('indentBlock', { blockId: cell(0, 1) })).toBe(false);

    expect(editor.can('delete-block', { id: tableId })).toBe(true);
    expect(editor.can('duplicateBlock', { blockId: tableId })).toBe(true);
  });

  it('duplicating a table copies its cells', () => {
    const { editor, tableId, fill, get, noteChildren, valid } = setup();

    fill();
    editor.dispatch({ type: 'duplicateBlock', payload: { blockId: tableId } });

    const copy = get(noteChildren()[2]);

    expect(copy.flavour).toBe('block:table');
    expect(copy.children).toHaveLength(3);
    expect(editor.engine.inline.toPlainText(get(get(copy.children[2]).children[1]).content)).toBe(
      'r2c1',
    );
    expect(valid()).toEqual([]);
  });
});

describe('table: rows and columns', () => {
  it('inserts a row anywhere and returns the caret in its first cell', () => {
    const { run, fill, grid, cell, valid } = setup();

    fill();

    expect(run('insertTableRow', { index: 1 })).toEqual({ blockId: cell(1, 0), offset: 0 });
    run('insertTableRow', { index: 0 });
    run('insertTableRow', { index: 5 });

    expect(grid()).toEqual([
      ['', '', ''],
      ['r0c0', 'r0c1', 'r0c2'],
      ['', '', ''],
      ['r1c0', 'r1c1', 'r1c2'],
      ['r2c0', 'r2c1', 'r2c2'],
      ['', '', ''],
    ]);
    expect(valid()).toEqual([]);
  });

  it('inserts a column anywhere', () => {
    const { run, fill, grid, cell, valid } = setup();

    fill();

    expect(run('insertTableColumn', { index: 3 })).toEqual({ blockId: cell(0, 3), offset: 0 });
    run('insertTableColumn', { index: 0 });

    expect(grid()[1]).toEqual(['', 'r1c0', 'r1c1', 'r1c2', '']);
    expect(valid()).toEqual([]);
  });

  it('deletes rows and columns but never the last one', () => {
    const { editor, run, fill, grid, cell, tableId, valid } = setup();

    fill();

    expect(run('deleteTableRow', { index: 2 })).toEqual({ blockId: cell(1, 0), offset: 0 });
    expect(run('deleteTableColumn', { index: 0 })).toEqual({ blockId: cell(0, 0), offset: 0 });
    expect(grid()).toEqual([
      ['r0c1', 'r0c2'],
      ['r1c1', 'r1c2'],
    ]);

    run('deleteTableRow', { index: 0 });
    run('deleteTableColumn', { index: 1 });
    expect(grid()).toEqual([['r1c1']]);

    expect(editor.can('deleteTableRow', { blockId: tableId, index: 0 })).toBe(false);
    expect(editor.can('deleteTableColumn', { blockId: tableId, index: 0 })).toBe(false);
    expect(valid()).toEqual([]);
  });

  it('moves rows and columns', () => {
    const { run, fill, grid, valid } = setup();

    fill();
    run('moveTableRow', { from: 0, to: 2 });
    run('moveTableColumn', { from: 2, to: 0 });

    expect(grid()).toEqual([
      ['r1c2', 'r1c0', 'r1c1'],
      ['r2c2', 'r2c0', 'r2c1'],
      ['r0c2', 'r0c0', 'r0c1'],
    ]);

    run('moveTableRow', { from: 2, to: 0 });
    run('moveTableColumn', { from: 0, to: 2 });
    expect(grid()[0]).toEqual(['r0c0', 'r0c1', 'r0c2']);
    expect(valid()).toEqual([]);
  });

  it('rejects indexes out of range', () => {
    const { editor, tableId, firstId } = setup();
    const can = (type: string, payload: Record<string, unknown>) =>
      editor.can(type, { blockId: tableId, ...payload });

    expect(can('insertTableRow', { index: 4 })).toBe(false);
    expect(can('insertTableRow', { index: -1 })).toBe(false);
    expect(can('insertTableRow', { index: 1.5 })).toBe(false);
    expect(can('insertTableColumn', { index: 4 })).toBe(false);
    expect(can('deleteTableRow', { index: 3 })).toBe(false);
    expect(can('deleteTableColumn', { index: 3 })).toBe(false);
    expect(can('moveTableRow', { from: 0, to: 0 })).toBe(false);
    expect(can('moveTableRow', { from: 0, to: 3 })).toBe(false);
    expect(can('moveTableColumn', { from: 3, to: 0 })).toBe(false);
    expect(can('setTableColumnWidth', { index: 3, width: 100 })).toBe(false);
    expect(can('setTableColumnWidth', { index: 0, width: -5 })).toBe(false);

    expect(editor.can('insertTableRow', { blockId: firstId, index: 0 })).toBe(false);
  });

  it('every operation is one undo step', () => {
    const { editor, run, fill, grid } = setup();

    fill();
    editor.sealHistory();

    const before = grid();

    run('insertTableColumn', { index: 1 });
    editor.undo();
    expect(grid()).toEqual(before);

    run('deleteTableRow', { index: 1 });
    editor.undo();
    expect(grid()).toEqual(before);

    run('moveTableColumn', { from: 0, to: 2 });
    editor.undo();
    expect(grid()).toEqual(before);
  });

  it('column widths follow their columns', () => {
    const { run, get, tableId } = setup();
    const widths = () => (get(tableId).props as { widths?: (number | null)[] }).widths;

    run('insertTableColumn', { index: 0 });
    expect(widths()).toBeUndefined();

    run('setTableColumnWidth', { index: 1, width: 120 });
    expect(widths()).toEqual([null, 120, null, null]);

    run('insertTableColumn', { index: 1 });
    expect(widths()).toEqual([null, null, 120, null, null]);

    run('moveTableColumn', { from: 2, to: 0 });
    expect(widths()).toEqual([120, null, null, null, null]);

    run('deleteTableColumn', { index: 1 });
    expect(widths()).toEqual([120, null, null, null]);

    run('deleteTableColumn', { index: 0 });
    run('setTableColumnWidth', { index: 0, width: 80 });
    run('setTableColumnWidth', { index: 0, width: null });
    expect(widths()).toBeUndefined();
  });
});

describe('table: editing text in cells', () => {
  it('Enter adds a line inside the cell and never leaves it', () => {
    const { editor, cell, text, type, grid, valid } = setup();
    const id = cell(0, 0);

    type(id, 'a');
    expect(editor.dispatch({ type: 'splitBlock', payload: { blockId: id, offset: 1 } })).toEqual({
      blockId: id,
      offset: 2,
    });
    editor.dispatch({ type: 'splitBlock', payload: { blockId: id, offset: 2 } });

    expect(text(id)).toBe('a\n\n');
    expect(grid()).toHaveLength(3);
    expect(valid()).toEqual([]);
  });

  it('Backspace at the start of a cell does nothing', () => {
    const { editor, cell, fill, grid } = setup();

    fill();

    const before = grid();

    for (const id of [cell(0, 0), cell(0, 1), cell(1, 0)]) {
      expect(
        editor.dispatch({ type: 'deleteBackward', payload: { blockId: id, offset: 0 } }),
      ).toBeUndefined();
    }

    expect(grid()).toEqual(before);
    expect(
      editor.dispatch({ type: 'deleteBackward', payload: { blockId: cell(0, 0), offset: 2 } }),
    ).toEqual({ blockId: cell(0, 0), offset: 1 });
  });

  it('Backspace in the paragraph after a table does not touch the table', () => {
    const { editor, tableId, noteChildren, grid } = setup();
    const after = (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: tableId },
      }) as CaretResult
    ).blockId;

    expect(
      editor.dispatch({ type: 'deleteBackward', payload: { blockId: after, offset: 0 } }),
    ).toBeUndefined();
    expect(noteChildren()).toContain(tableId);
    expect(grid()).toHaveLength(3);
  });

  it('formats and aligns text in a cell', () => {
    const { editor, cell, type, get } = setup();
    const id = cell(1, 1);

    type(id, 'bold');
    editor.dispatch({
      type: 'toggleFormat',
      payload: { blockId: id, from: 0, to: 4, format: 'bold' },
    });
    editor.dispatch({
      type: 'setAlign',
      payload: {
        from: { blockId: id, offset: 0 },
        to: { blockId: id, offset: 0 },
        align: 'center',
      },
    });

    expect(get(id).content).toEqual([{ insert: 'bold', attributes: { bold: true } }]);
    expect(get(id).props).toMatchObject({ align: 'center' });
  });
});

describe('table: deleting a selection', () => {
  it('across cells clears their text and keeps the grid', () => {
    const { editor, cell, fill, grid, valid } = setup();

    fill();

    const caret = editor.dispatch({
      type: 'deleteRange',
      payload: { from: { blockId: cell(0, 1), offset: 2 }, to: { blockId: cell(1, 1), offset: 2 } },
    });

    expect(caret).toEqual({ blockId: cell(0, 1), offset: 2 });
    expect(grid()).toEqual([
      ['r0c0', 'r0', ''],
      ['', 'c1', 'r1c2'],
      ['r2c0', 'r2c1', 'r2c2'],
    ]);
    expect(valid()).toEqual([]);

    editor.undo();
    expect(grid()[1]).toEqual(['r1c0', 'r1c1', 'r1c2']);
  });

  it('inside one cell deletes just that text', () => {
    const { editor, cell, fill, grid } = setup();

    fill();
    editor.dispatch({
      type: 'deleteRange',
      payload: { from: { blockId: cell(2, 2), offset: 1 }, to: { blockId: cell(2, 2), offset: 3 } },
    });

    expect(grid()[2]).toEqual(['r2c0', 'r2c1', 'r2']);
  });

  it('from a paragraph into a table clears, without merging the cell into the paragraph', () => {
    const { editor, firstId, cell, fill, grid, type, text, noteChildren, tableId, valid } = setup();

    type(firstId, 'before');
    fill();
    editor.dispatch({
      type: 'deleteRange',
      payload: { from: { blockId: firstId, offset: 3 }, to: { blockId: cell(0, 1), offset: 2 } },
    });

    expect(text(firstId)).toBe('bef');
    expect(grid()[0]).toEqual(['', 'c1', 'r0c2']);
    expect(noteChildren()).toEqual([firstId, tableId]);
    expect(valid()).toEqual([]);
  });

  it('from a table into a later paragraph removes whole blocks in between', () => {
    const { editor, tableId, cell, fill, grid, type, text, noteChildren, firstId, valid } = setup();
    const insert = (afterId: BlockId, value: string) => {
      const id = (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:paragraph', afterId },
        }) as CaretResult
      ).blockId;

      type(id, value);

      return id;
    };
    const middle = insert(tableId, 'middle');
    const last = insert(middle, 'last one');

    fill();
    editor.dispatch({
      type: 'deleteRange',
      payload: { from: { blockId: cell(2, 1), offset: 1 }, to: { blockId: last, offset: 5 } },
    });

    expect(grid()[2]).toEqual(['r2c0', 'r', '']);
    expect(noteChildren()).toEqual([firstId, tableId, last]);
    expect(text(last)).toBe('one');
    expect(valid()).toEqual([]);
  });

  it('a selection that covers the whole table removes it', () => {
    const { editor, tableId, firstId, type, text, noteChildren, fill } = setup();
    const after = (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:paragraph', afterId: tableId },
      }) as CaretResult
    ).blockId;

    type(firstId, 'ab');
    type(after, 'cd');
    fill();
    editor.dispatch({
      type: 'deleteRange',
      payload: { from: { blockId: firstId, offset: 1 }, to: { blockId: after, offset: 1 } },
    });

    expect(noteChildren()).toEqual([firstId]);
    expect(text(firstId)).toBe('ad');
  });

  it('between two tables clears the cells of both and removes what lies between', () => {
    const { editor, tableId, cell, fill, grid, getBlock, noteChildren, firstId, valid, get, text } =
      setup();
    const second = locateTableCell(
      getBlock,
      (
        editor.dispatch({
          type: 'insertBlock',
          payload: { flavour: 'block:table', afterId: tableId },
        }) as CaretResult
      ).blockId,
    )!.tableId;
    const target = tableCellAt(getBlock, second, 0, 1)!;

    fill();
    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: target, from: 0, to: 0, text: 'keep' },
    });
    editor.dispatch({
      type: 'deleteRange',
      payload: { from: { blockId: cell(2, 2), offset: 0 }, to: { blockId: target, offset: 2 } },
    });

    expect(grid()[2]).toEqual(['r2c0', 'r2c1', '']);
    expect(text(target)).toBe('ep');
    expect(noteChildren()).toEqual([firstId, tableId, second]);
    expect(get(second).children).toHaveLength(3);
    expect(valid()).toEqual([]);
  });
});

describe('table: clipboard', () => {
  it('pasting several blocks into a cell inserts them as lines of text', () => {
    const { editor, cell, type, text, grid, valid } = setup();
    const id = cell(0, 0);

    type(id, 'ab');
    const caret = editor.dispatch({
      type: 'pasteFragment',
      payload: {
        at: { blockId: id, offset: 1 },
        fragment: {
          blocks: [
            { flavour: 'block:paragraph', props: {}, content: [{ insert: 'one' }], children: [] },
            {
              flavour: 'block:list',
              props: { type: 'bullet' },
              content: [{ insert: 'two', attributes: { bold: true } }],
              children: [
                { flavour: 'block:list', props: {}, content: [{ insert: 'three' }], children: [] },
              ],
            },
          ],
        },
      },
    });

    expect(text(id)).toBe('aone\ntwo\nthreeb');
    expect(caret).toEqual({ blockId: id, offset: 14 });
    expect(grid()).toHaveLength(3);
    expect(valid()).toEqual([]);
  });

  it('cells copied out of a table paste elsewhere as paragraphs', () => {
    const { editor, cell, fill, firstId, noteId, get, valid } = setup();

    fill();

    const fragment = editor.copyFragment(
      { blockId: cell(0, 1), offset: 0 },
      { blockId: cell(1, 0), offset: 4 },
    );

    editor.dispatch({
      type: 'pasteFragment',
      payload: { at: { blockId: firstId, offset: 0 }, fragment },
    });

    const flavours = get(noteId).children.map((id) => get(id).flavour);

    expect(flavours.filter((flavour) => flavour === 'block:table')).toHaveLength(1);
    expect(valid()).toEqual([]);
  });
});

describe('table: validation and repair', () => {
  const schema = createSchemaRegistry(tableBlockSchemas);

  it('reports ragged and empty tables', () => {
    const { editor, tableId, get } = setup();
    const snapshot = editor.serialize();
    const [firstRow, secondRow] = get(tableId).children;
    const dropped = snapshot.blocks[secondRow].children.pop()!;

    delete snapshot.blocks[dropped];
    expect(validateSnapshot(snapshot, schema)).toEqual([
      `table "${tableId}": row "${secondRow}" has 2 cells, expected 3`,
    ]);

    const empty = editor.serialize();

    for (const rowId of empty.blocks[tableId].children) {
      for (const id of empty.blocks[rowId].children) delete empty.blocks[id];
      delete empty.blocks[rowId];
    }
    empty.blocks[tableId].children = [];
    expect(validateSnapshot(empty, schema)).toEqual([`table "${tableId}" has no rows`]);
    expect(firstRow).toBeDefined();
  });

  it('repairSnapshot pads short rows and fills an empty table', () => {
    const { editor, tableId, get } = setup();
    const snapshot = editor.serialize();
    const secondRow = get(tableId).children[1];
    const dropped = snapshot.blocks[secondRow].children.pop()!;

    delete snapshot.blocks[dropped];

    const repaired = repairSnapshot(snapshot, schema);

    expect(repaired.fixes).toEqual([`table "${tableId}": row "${secondRow}" padded with 1 cells`]);
    expect(validateSnapshot(repaired.snapshot, schema)).toEqual([]);

    const empty = editor.serialize();

    for (const rowId of empty.blocks[tableId].children) {
      for (const id of empty.blocks[rowId].children) delete empty.blocks[id];
      delete empty.blocks[rowId];
    }
    empty.blocks[tableId].children = [];

    const filled = repairSnapshot(empty, schema);

    expect(validateSnapshot(filled.snapshot, schema)).toEqual([]);
    expect(filled.snapshot.blocks[tableId].children).toHaveLength(1);
  });

  it('a valid table needs no repair', () => {
    const { editor } = setup();

    expect(repairSnapshot(editor.serialize(), schema).fixes).toEqual([]);
  });
});

describe('table: grid helpers', () => {
  it('locate cells and reject other blocks', () => {
    const { getBlock, tableId, cell, firstId } = setup();

    expect(locateTableCell(getBlock, cell(2, 1))).toEqual({ tableId, row: 2, column: 1 });
    expect(locateTableCell(getBlock, firstId)).toBeUndefined();
    expect(locateTableCell(getBlock, tableId)).toBeUndefined();
    expect(tableSize(getBlock, firstId)).toBeUndefined();
    expect(tableCellAt(getBlock, firstId, 0, 0)).toBeUndefined();
    expect(tableCellAt(getBlock, tableId, 9, 0)).toBeUndefined();
  });
});
