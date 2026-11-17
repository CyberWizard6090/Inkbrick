import { describe, expect, it } from 'vitest';

import {
  createTableEditor,
  parseDate,
  parseNumber,
  sortKey,
  sortedOrder,
  tableIdOf,
  tableValue,
} from '../src';

describe('parseNumber', () => {
  it('reads numbers the way they are written', () => {
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber('1 234,5 ₽')).toBe(1234.5);
    expect(parseNumber('$1,234.50')).toBe(1234.5);
    expect(parseNumber('1.234.567')).toBe(1234567);
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('3,5')).toBe(3.5);
    expect(parseNumber('−3%')).toBe(-3);
    expect(parseNumber('about 7 kg')).toBe(7);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1 234')).toBe(1234);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1 234')).toBe(1234);
    expect(parseNumber('n/a')).toBeUndefined();
  });
});

describe('parseDate', () => {
  it('reads ISO, day-first and anything Date understands', () => {
    expect(parseDate('2024-03-05')).toBe(Date.UTC(2024, 2, 5));
    expect(parseDate('05.03.2024')).toBe(Date.UTC(2024, 2, 5));
    expect(parseDate('5/3/24')).toBe(Date.UTC(2024, 2, 5));
    expect(parseDate('March 5, 2024 UTC')).toBe(Date.UTC(2024, 2, 5));
    expect(parseDate('soon')).toBeUndefined();
  });
});

describe('sortedOrder', () => {
  it('sorts text with numbers as numbers, ignoring case', () => {
    const keys = ['item 10', 'Item 2', 'item 1'].map((text) => sortKey(text, 'text'));

    expect(sortedOrder(keys, 'asc')).toEqual([2, 1, 0]);
    expect(sortedOrder(keys, 'desc')).toEqual([0, 1, 2]);
  });

  it('puts empty and unreadable values last in both directions and keeps equal ones in order', () => {
    const keys = ['5', '', 'x', '5', '1'].map((text) => sortKey(text, 'number'));

    expect(sortedOrder(keys, 'asc')).toEqual([4, 0, 3, 1, 2]);
    expect(sortedOrder(keys, 'desc')).toEqual([0, 3, 4, 1, 2]);
  });
});

describe('table column types and sorting', () => {
  const make = () =>
    createTableEditor({
      rows: [
        ['Name', 'Qty'],
        ['pear', '1,5'],
        ['apple', '1,25'],
        ['fig', ''],
        ['kiwi', '10,5'],
      ],
    });
  const run = (editor: ReturnType<typeof make>, type: string, payload: Record<string, unknown>) =>
    editor.dispatch({ type, payload: { blockId: tableIdOf(editor), ...payload } } as never);
  const names = (editor: ReturnType<typeof make>) => tableValue(editor).rows.map((row) => row[0]);

  it('sorts the body rows and leaves the header; the type decides how', () => {
    const editor = make();

    run(editor, 'sortTableRows', { column: 1, direction: 'asc' });
    expect(names(editor)).toEqual(['Name', 'pear', 'apple', 'kiwi', 'fig']);

    run(editor, 'setTableColumnType', { index: 1, type: 'number' });
    run(editor, 'sortTableRows', { column: 1, direction: 'asc' });
    expect(names(editor)).toEqual(['Name', 'apple', 'pear', 'kiwi', 'fig']);

    run(editor, 'sortTableRows', { column: 0, direction: 'desc' });
    expect(names(editor)).toEqual(['Name', 'pear', 'kiwi', 'fig', 'apple']);
  });

  it('is one undo step and cannot run when the rows are already in that order', () => {
    const editor = make();
    const tableId = tableIdOf(editor)!;

    expect(editor.can('sortTableRows', { blockId: tableId, column: 0, direction: 'asc' })).toBe(
      true,
    );

    run(editor, 'sortTableRows', { column: 0, direction: 'asc' });
    expect(editor.can('sortTableRows', { blockId: tableId, column: 0, direction: 'asc' })).toBe(
      false,
    );

    editor.store.undo();
    expect(names(editor)).toEqual(['Name', 'pear', 'apple', 'fig', 'kiwi']);
  });

  it('keeps types with their columns when columns are added, moved and deleted', () => {
    const editor = make();
    const types = () => editor.document.getBlock(tableIdOf(editor)!)!.props.columnTypes;

    run(editor, 'setTableColumnType', { index: 1, type: 'number' });
    expect(types()).toEqual(['text', 'number']);

    run(editor, 'insertTableColumn', { index: 0 });
    expect(types()).toEqual(['text', 'text', 'number']);

    run(editor, 'moveTableColumn', { from: 2, to: 0 });
    expect(types()).toEqual(['number', 'text', 'text']);

    run(editor, 'deleteTableColumn', { index: 0 });
    expect(types()).toEqual(['text', 'text']);

    run(editor, 'setTableColumnType', { index: 0, type: 'date' });
    run(editor, 'setTableColumnType', { index: 0, type: 'text' });
    expect(types()).toBeUndefined();
  });

  it('rejects unknown types and columns', () => {
    const editor = make();
    const tableId = tableIdOf(editor)!;

    expect(editor.can('setTableColumnType', { blockId: tableId, index: 0, type: 'color' })).toBe(
      false,
    );
    expect(editor.can('setTableColumnType', { blockId: tableId, index: 5, type: 'number' })).toBe(
      false,
    );
    expect(editor.can('sortTableRows', { blockId: tableId, column: 5, direction: 'asc' })).toBe(
      false,
    );
  });
});

describe('column types: checkbox, select and options', () => {
  const make = () =>
    createTableEditor({
      rows: [
        ['Task', 'Done', 'Tag'],
        ['a', 'true', 'x'],
        ['b', '', 'y'],
        ['c', 'true', ''],
      ],
    });
  const run = (editor: ReturnType<typeof make>, type: string, payload: Record<string, unknown>) =>
    editor.dispatch({ type, payload: { blockId: tableIdOf(editor), ...payload } } as never);
  const props = (editor: ReturnType<typeof make>) =>
    editor.document.getBlock(tableIdOf(editor)!)!.props;
  const colors = [
    { label: 'Open', color: 'green' },
    { label: 'Closed', color: 'gray' },
  ];

  it('sorts a checkbox column: unchecked (including empty) before checked, in both directions', () => {
    expect(['true', '', 'TRUE', 'false'].map((text) => sortKey(text, 'checkbox'))).toEqual([
      1, 0, 1, 0,
    ]);

    const editor = make();

    run(editor, 'setTableColumnType', { index: 1, type: 'checkbox' });
    run(editor, 'sortTableRows', { column: 1, direction: 'asc' });
    expect(tableValue(editor).rows.map((row) => row[0])).toEqual(['Task', 'b', 'a', 'c']);

    run(editor, 'sortTableRows', { column: 1, direction: 'desc' });
    expect(tableValue(editor).rows.map((row) => row[0])).toEqual(['Task', 'a', 'c', 'b']);
  });

  it('stores options per column and clears them with an empty list', () => {
    const editor = make();

    run(editor, 'setTableColumnOptions', { index: 2, options: colors });
    expect(props(editor).columnOptions).toEqual([null, null, colors]);

    run(editor, 'setTableColumnOptions', { index: 2, options: [] });
    expect(props(editor).columnOptions).toBeUndefined();
  });

  it('keeps options with their columns when columns are added, moved and deleted', () => {
    const editor = make();

    run(editor, 'setTableColumnOptions', { index: 2, options: colors });

    run(editor, 'insertTableColumn', { index: 0 });
    expect(props(editor).columnOptions).toEqual([null, null, null, colors]);

    run(editor, 'moveTableColumn', { from: 3, to: 0 });
    expect(props(editor).columnOptions).toEqual([colors, null, null, null]);

    run(editor, 'deleteTableColumn', { index: 0 });
    expect(props(editor).columnOptions).toEqual([null, null, null]);
  });

  it('rejects empty, duplicate, comma and unknown-colour options and a missing column', () => {
    const editor = make();
    const tableId = tableIdOf(editor)!;
    const can = (index: number, options: unknown) =>
      editor.can('setTableColumnOptions', { blockId: tableId, index, options } as never);

    expect(can(0, [{ label: 'A' }])).toBe(true);
    expect(can(0, [{ label: ' ' }])).toBe(false);
    expect(can(0, [{ label: 'A' }, { label: 'A' }])).toBe(false);
    expect(can(0, [{ label: 'A, B' }])).toBe(false);
    expect(can(0, [{ label: 'A', color: 'teal' }])).toBe(false);
    expect(can(9, [{ label: 'A' }])).toBe(false);
    expect(can(0, 'A')).toBe(false);
  });

  it('setting options is one undo step', () => {
    const editor = make();

    run(editor, 'setTableColumnOptions', { index: 2, options: colors });
    editor.store.undo();
    expect(props(editor).columnOptions).toBeUndefined();
  });
});

describe('table view: hidden columns and filters', () => {
  const make = () =>
    createTableEditor({
      rows: [
        ['A', 'B', 'C'],
        ['1', '2', '3'],
      ],
    });
  const run = (editor: ReturnType<typeof make>, type: string, payload: Record<string, unknown>) =>
    editor.dispatch({ type, payload: { blockId: tableIdOf(editor), ...payload } } as never);
  const can = (editor: ReturnType<typeof make>, type: string, payload: Record<string, unknown>) =>
    editor.can(type as never, { blockId: tableIdOf(editor), ...payload } as never);
  const props = (editor: ReturnType<typeof make>) =>
    editor.document.getBlock(tableIdOf(editor)!)!.props;

  it('hides and shows columns, keeps the list with the columns and never hides the last visible one', () => {
    const editor = make();

    run(editor, 'setTableColumnHidden', { index: 1, hidden: true });
    expect(props(editor).columnHidden).toEqual([false, true, false]);

    run(editor, 'insertTableColumn', { index: 0 });
    expect(props(editor).columnHidden).toEqual([false, false, true, false]);

    run(editor, 'moveTableColumn', { from: 2, to: 0 });
    expect(props(editor).columnHidden).toEqual([true, false, false, false]);

    run(editor, 'setTableColumnHidden', { index: 0, hidden: false });
    expect(props(editor).columnHidden).toBeUndefined();

    run(editor, 'setTableColumnHidden', { index: 0, hidden: true });
    run(editor, 'setTableColumnHidden', { index: 1, hidden: true });
    run(editor, 'setTableColumnHidden', { index: 2, hidden: true });
    expect(can(editor, 'setTableColumnHidden', { index: 3, hidden: true })).toBe(false);
    expect(can(editor, 'setTableColumnHidden', { index: 3, hidden: false })).toBe(true);
    expect(can(editor, 'setTableColumnHidden', { index: 9, hidden: true })).toBe(false);
  });

  it('stores filters per column, clears them with null and moves them with their columns', () => {
    const editor = make();
    const filter = { op: 'contains', value: 'x' };

    run(editor, 'setTableColumnFilter', { index: 2, filter });
    expect(props(editor).columnFilters).toEqual([null, null, filter]);

    run(editor, 'insertTableColumn', { index: 0 });
    expect(props(editor).columnFilters).toEqual([null, null, null, filter]);

    run(editor, 'setTableColumnFilter', { index: 3, filter: null });
    expect(props(editor).columnFilters).toBeUndefined();
  });

  it('rejects unknown conditions, a missing column and a view change on merged cells; one undo step', () => {
    const editor = make();

    expect(can(editor, 'setTableColumnFilter', { index: 0, filter: { op: 'like' } })).toBe(false);
    expect(can(editor, 'setTableColumnFilter', { index: 9, filter: null })).toBe(false);
    expect(
      can(editor, 'setTableColumnFilter', {
        index: 0,
        filter: { op: 'equals', value: 'a'.repeat(300) },
      }),
    ).toBe(false);

    run(editor, 'setTableColumnFilter', { index: 0, filter: { op: 'empty' } });
    editor.store.undo();
    expect(props(editor).columnFilters).toBeUndefined();

    run(editor, 'mergeTableCells', { range: { top: 0, left: 0, bottom: 0, right: 1 } });
    expect(can(editor, 'setTableColumnHidden', { index: 2, hidden: true })).toBe(false);
    expect(can(editor, 'setTableColumnFilter', { index: 0, filter: null })).toBe(false);
  });
});
