import { describe, expect, it } from 'vitest';

import {
  createTableEditor,
  expandRangeToMerges,
  mergeAt,
  mergesAfterDelete,
  mergesAfterInsert,
  mergesWithin,
  normalizeMerges,
  tableIdOf,
  tableRangeFragment,
  tableValue,
} from '../src';
import { toHtml } from '@inkbrick/document';

const m = (row: number, column: number, rows: number, columns: number) => ({
  row,
  column,
  rows,
  columns,
});

describe('normalizeMerges', () => {
  it('keeps valid merges in grid order and drops the rest', () => {
    expect(
      normalizeMerges(
        [
          m(1, 1, 2, 2),
          m(0, 0, 1, 2),
          m(1, 2, 1, 2),
          m(0, 0, 1, 1),
          m(5, 0, 2, 1),
          { row: 0, column: 'x', rows: 1, columns: 2 },
          null,
        ],
        3,
        3,
      ),
    ).toEqual([m(0, 0, 1, 2), m(1, 1, 2, 2)]);
    expect(normalizeMerges(undefined, 3, 3)).toEqual([]);
  });
});

describe('mergeAt', () => {
  it('finds the merge of a cell and tells whether the cell is its origin', () => {
    const merges = [m(1, 1, 2, 2)];

    expect(mergeAt(merges, 1, 1)).toEqual({ merge: merges[0], origin: true });
    expect(mergeAt(merges, 2, 2)).toEqual({ merge: merges[0], origin: false });
    expect(mergeAt(merges, 0, 0)).toBeUndefined();
  });
});

describe('merges follow inserted and deleted rows and columns', () => {
  const merges = [m(1, 1, 2, 2)];

  it('shifts when inserted before, grows when inserted inside, stays when inserted after', () => {
    expect(mergesAfterInsert(merges, 'row', 0)).toEqual([m(2, 1, 2, 2)]);
    expect(mergesAfterInsert(merges, 'row', 1)).toEqual([m(2, 1, 2, 2)]);
    expect(mergesAfterInsert(merges, 'row', 2)).toEqual([m(1, 1, 3, 2)]);
    expect(mergesAfterInsert(merges, 'row', 3)).toEqual([m(1, 1, 2, 2)]);
    expect(mergesAfterInsert(merges, 'column', 2)).toEqual([m(1, 1, 2, 3)]);
  });

  it('shifts when deleted before, shrinks when deleted inside, drops what becomes one cell', () => {
    expect(mergesAfterDelete(merges, 'row', 0)).toEqual([m(0, 1, 2, 2)]);
    expect(mergesAfterDelete(merges, 'row', 2)).toEqual([m(1, 1, 1, 2)]);
    expect(mergesAfterDelete(merges, 'row', 3)).toEqual([m(1, 1, 2, 2)]);
    expect(mergesAfterDelete([m(0, 0, 1, 2)], 'column', 0)).toEqual([]);
    expect(mergesAfterDelete([m(0, 0, 2, 1)], 'row', 1)).toEqual([]);
    expect(mergesAfterDelete([m(0, 0, 1, 3)], 'row', 0)).toEqual([]);
  });
});

describe('ranges', () => {
  it('expands a range to the merges it touches, repeatedly', () => {
    const merges = [m(0, 0, 2, 2), m(1, 2, 2, 2)];

    expect(expandRangeToMerges({ top: 0, left: 1, bottom: 0, right: 2 }, merges)).toEqual({
      top: 0,
      left: 0,
      bottom: 2,
      right: 3,
    });
    expect(expandRangeToMerges({ top: 3, left: 0, bottom: 3, right: 0 }, merges)).toEqual({
      top: 3,
      left: 0,
      bottom: 3,
      right: 0,
    });
  });

  it('keeps the merges that lie fully inside a range, relative to its corner', () => {
    expect(
      mergesWithin([m(1, 1, 2, 2), m(0, 0, 1, 2)], { top: 1, left: 1, bottom: 3, right: 3 }),
    ).toEqual([m(0, 0, 2, 2)]);
  });
});

describe('merging cells', () => {
  const make = () =>
    createTableEditor({
      rows: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
        ['g', 'h', 'i'],
      ],
    });
  const run = (editor: ReturnType<typeof make>, type: string, payload: Record<string, unknown>) =>
    editor.dispatch({ type, payload: { blockId: tableIdOf(editor), ...payload } } as never);
  const merges = (editor: ReturnType<typeof make>) =>
    editor.document.getBlock(tableIdOf(editor)!)!.props.merges;
  const range = (top: number, left: number, bottom: number, right: number) => ({
    top,
    left,
    bottom,
    right,
  });

  it('collects the text in the top left cell and leaves the others empty', () => {
    const editor = make();

    run(editor, 'mergeTableCells', { range: range(0, 0, 1, 1) });

    expect(merges(editor)).toEqual([m(0, 0, 2, 2)]);
    expect(tableValue(editor).rows).toEqual([
      ['a\nb\nd\ne', '', 'c'],
      ['', '', 'f'],
      ['g', 'h', 'i'],
    ]);
  });

  it('refuses one cell and ranges outside the table; expands to whole merges', () => {
    const editor = make();
    const tableId = tableIdOf(editor)!;

    expect(editor.can('mergeTableCells', { blockId: tableId, range: range(1, 1, 1, 1) })).toBe(
      false,
    );
    expect(editor.can('mergeTableCells', { blockId: tableId, range: range(5, 5, 6, 6) })).toBe(
      false,
    );
    expect(editor.can('mergeTableCells', { blockId: tableId, range: 'all' })).toBe(false);

    run(editor, 'mergeTableCells', { range: range(0, 0, 0, 1) });
    run(editor, 'mergeTableCells', { range: range(0, 1, 1, 2) });

    expect(merges(editor)).toEqual([m(0, 0, 2, 3)]);
  });

  it('splits a merge from any of its cells; the text stays in the first cell', () => {
    const editor = make();

    run(editor, 'mergeTableCells', { range: range(1, 1, 2, 2) });
    expect(editor.can('splitTableCell', { blockId: tableIdOf(editor), row: 0, column: 0 })).toBe(
      false,
    );

    run(editor, 'splitTableCell', { row: 2, column: 2 });
    expect(merges(editor)).toBeUndefined();
    expect(tableValue(editor).rows[1][1]).toBe('e\nf\nh\ni');
  });

  it('is one undo step', () => {
    const editor = make();

    run(editor, 'mergeTableCells', { range: range(0, 0, 0, 2) });
    editor.store.undo();

    expect(merges(editor)).toBeUndefined();
    expect(tableValue(editor).rows[0]).toEqual(['a', 'b', 'c']);
  });

  it('keeps merges right when rows and columns are inserted and deleted', () => {
    const editor = make();

    run(editor, 'mergeTableCells', { range: range(1, 1, 2, 2) });
    run(editor, 'insertTableRow', { index: 0 });
    expect(merges(editor)).toEqual([m(2, 1, 2, 2)]);

    run(editor, 'insertTableColumn', { index: 2 });
    expect(merges(editor)).toEqual([m(2, 1, 2, 3)]);

    run(editor, 'deleteTableColumn', { index: 3 });
    expect(merges(editor)).toEqual([m(2, 1, 2, 2)]);

    run(editor, 'deleteTableRow', { index: 3 });
    expect(merges(editor)).toEqual([m(2, 1, 1, 2)]);

    run(editor, 'deleteTableColumn', { index: 1 });
    expect(merges(editor)).toBeUndefined();
  });

  it('does not move or sort rows and columns while there are merges', () => {
    const editor = make();
    const tableId = tableIdOf(editor)!;

    expect(editor.can('moveTableRow', { blockId: tableId, from: 0, to: 1 })).toBe(true);

    run(editor, 'mergeTableCells', { range: range(0, 0, 0, 1) });

    expect(editor.can('moveTableRow', { blockId: tableId, from: 1, to: 2 })).toBe(false);
    expect(editor.can('moveTableColumn', { blockId: tableId, from: 0, to: 1 })).toBe(false);
    expect(editor.can('sortTableRows', { blockId: tableId, column: 0, direction: 'desc' })).toBe(
      false,
    );

    run(editor, 'splitTableCell', { row: 0, column: 0 });
    expect(editor.can('moveTableRow', { blockId: tableId, from: 1, to: 2 })).toBe(true);
  });
});

describe('merged cells in export and the clipboard', () => {
  const merged = () => {
    const editor = createTableEditor({
      rows: [
        ['Name', 'Qty', ''],
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ],
    });
    const tableId = tableIdOf(editor)!;

    editor.dispatch({
      type: 'mergeTableCells',
      payload: { blockId: tableId, range: { top: 0, left: 1, bottom: 0, right: 2 } },
    } as never);
    editor.dispatch({
      type: 'mergeTableCells',
      payload: { blockId: tableId, range: { top: 1, left: 0, bottom: 2, right: 0 } },
    } as never);

    return { editor, tableId };
  };

  it('writes colspan and rowspan and leaves out the covered cells in HTML', () => {
    const { editor } = merged();
    const html = toHtml(editor.document, { schema: editor.schema, title: false });

    expect(html).toContain('<th colspan="2">Qty</th>');
    expect(html).toContain('<td rowspan="2">a<br>d</td>');
    expect(html.match(/<th[ >]/g)).toHaveLength(2);
    expect(html.match(/<td[ >]/g)).toHaveLength(5);
  });

  it('copies merges with a rectangle and with a selection of whole rows and columns', () => {
    const { editor, tableId } = merged();
    const getBlock = (id: string) => editor.document.getBlock(id);

    const inner = tableRangeFragment(getBlock, tableId, { top: 0, left: 0, bottom: 2, right: 1 });

    expect(inner.blocks[0].props.merges).toEqual([m(1, 0, 2, 1)]);

    const cut = tableRangeFragment(getBlock, tableId, { top: 0, left: 1, bottom: 2, right: 1 });

    expect(cut.blocks[0].props.merges).toBeUndefined();
  });

  it('keeps the merges of a table copied with the selection', () => {
    const { editor, tableId } = merged();
    const table = editor.document.getBlock(tableId)!;
    const first = editor.document.getBlock(table.children[0])!.children[0];
    const last = editor.document.getBlock(table.children[2])!.children[2];
    const fragment = editor.copyFragment(
      { blockId: first, offset: 0 },
      { blockId: last, offset: 0 },
    );

    expect(fragment.blocks[0].props.merges).toEqual([m(0, 1, 1, 2), m(1, 0, 2, 1)]);
  });
});
