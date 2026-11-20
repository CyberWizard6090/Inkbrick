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

describe('parseNumber with the decimal separator of the language', () => {
  it('a comma is the decimal separator when the language uses it', () => {
    expect(parseNumber('0,125', ',')).toBe(0.125);
    expect(parseNumber('2,500', ',')).toBe(2.5);
    expect(parseNumber('1 000,5', ',')).toBe(1000.5);
    expect(parseNumber('-3,25', ',')).toBe(-3.25);
  });

  it('a dot is the decimal separator and a comma groups thousands otherwise', () => {
    expect(parseNumber('1,234', '.')).toBe(1234);
    expect(parseNumber('1,234.5', '.')).toBe(1234.5);
  });

  it('a number written in the other convention is read by its own separators', () => {
    // Оба разделителя: дробная часть — после последнего, независимо от языка.
    expect(parseNumber('1.234,56', '.')).toBe(1234.56);
    expect(parseNumber('$1,234.50', ',')).toBe(1234.5);
    // Повтор разделителя — тысячи; одна-две цифры после разделителя — дробь.
    expect(parseNumber('1.234.567', ',')).toBe(1234567);
    expect(parseNumber('3.5', ',')).toBe(3.5);
    // Неоднозначная запись решается языком.
    expect(parseNumber('1.234', ',')).toBe(1234);
    expect(parseNumber('1.234', '.')).toBe(1.234);
  });

  it('without a language the old reading stays', () => {
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('1,5')).toBe(1.5);
  });
});

describe('parseDate and bare numbers', () => {
  it('a bare number is not a date: it does not sort among real dates', () => {
    expect(parseDate('10')).toBeUndefined();
    expect(parseDate('2')).toBeUndefined();
  });
});
