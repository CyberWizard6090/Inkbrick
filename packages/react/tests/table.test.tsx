import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { validateSnapshot } from '@inkbrick/document';
import { locateTableCell, tableCellAt, tableSize, type CaretResult } from '@inkbrick/engine';

import { tableBlocks } from '../src';
import { hasHandle } from '../src/block-handle/geometry';
import { resolveSlashItems } from '../src/slash/defaultSlashItems';
import { createTranslator, resolveMessages } from '../src/i18n/translate';
import { controllerSlashItems } from '../src/controllers/adapters';
import { mountEditor } from './harness';

afterEach(cleanup);

function mountTable() {
  const mounted = mountEditor(['before'], { blocks: tableBlocks });
  const { editor, ids } = mounted;
  const getBlock = (id: string) => editor.document.getBlock(id);
  let caret!: CaretResult;

  act(() => {
    caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: ids[0] },
    }) as CaretResult;
  });

  const tableId = locateTableCell(getBlock, caret.blockId)!.tableId;
  const cell = (row: number, column: number) => tableCellAt(getBlock, tableId, row, column)!;
  const text = (id: string) => editor.engine.inline.toPlainText(getBlock(id)!.content);

  return { ...mounted, getBlock, tableId, cell, text };
}

describe('table rendering', () => {
  it('renders a real table with a cell per block and marks the header row', () => {
    const { root, tableId, cell } = mountTable();
    const table = root.querySelector<HTMLElement>('[data-inkbrick-block="table"]')!;

    expect(table.dataset.blockId).toBe(tableId);
    expect(table.hasAttribute('data-header')).toBe(true);
    expect(table.querySelectorAll('tr')).toHaveLength(3);
    expect(table.querySelectorAll('td')).toHaveLength(9);
    expect(table.querySelector('td')!.dataset.blockId).toBe(cell(0, 0));
    expect(table.querySelector(`td .editable[data-id="${cell(0, 0)}"]`)).not.toBeNull();
    expect(table.querySelector('colgroup')).toBeNull();
  });

  it('follows the model: new rows, column widths, alignment, header off', () => {
    const { editor, root, tableId, cell } = mountTable();

    act(() => {
      editor.dispatch({ type: 'insertTableRow', payload: { blockId: tableId, index: 3 } } as never);
      editor.dispatch({
        type: 'setTableColumnWidth',
        payload: { blockId: tableId, index: 1, width: 120 },
      } as never);
      editor.dispatch({
        type: 'setAlign',
        payload: {
          from: { blockId: cell(0, 0), offset: 0 },
          to: { blockId: cell(0, 0), offset: 0 },
          align: 'right',
        },
      });
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId: tableId, props: { header: false } },
      });
    });

    const table = root.querySelector<HTMLElement>('[data-inkbrick-block="table"]')!;
    const columns = [...table.querySelectorAll<HTMLElement>('col')];

    expect(table.querySelectorAll('tr')).toHaveLength(4);
    expect(columns.map((column) => column.style.width)).toEqual(['', '120px', '']);
    expect(table.querySelector<HTMLElement>('td')!.dataset.align).toBe('right');
    expect(table.hasAttribute('data-header')).toBe(false);
  });

  it('cells show no slash hint and have no block handle of their own', () => {
    const { editor, tableId, cell, getBlock, editable, caret } = mountTable();
    const rowId = getBlock(tableId)!.children[0];

    caret(cell(0, 0), 0);

    expect(editable(cell(0, 0)).hasAttribute('data-hint')).toBe(false);
    expect(hasHandle(editor, tableId)).toBe(true);
    expect(hasHandle(editor, rowId)).toBe(false);
    expect(hasHandle(editor, cell(0, 0))).toBe(false);
  });
});

describe('table keyboard', () => {
  it('Tab and Shift+Tab walk the cells row by row', () => {
    const { cell, caret, key, type, text } = mountTable();

    caret(cell(0, 0), 0);
    type('a');

    expect(key('Tab').defaultPrevented).toBe(true);
    type('b');
    key('Tab');
    key('Tab');
    type('c');

    expect([text(cell(0, 0)), text(cell(0, 1)), text(cell(1, 0))]).toEqual(['a', 'b', 'c']);

    key('Tab', { shift: true });
    key('Tab', { shift: true });
    // Курсор встаёт в конец текста ячейки.
    type('!');
    expect(text(cell(0, 1))).toBe('b!');
  });

  it('Shift+Tab in the first cell stays put; Tab in the last cell adds a row', () => {
    const { cell, caret, key, type, text, getBlock, tableId, editor } = mountTable();

    caret(cell(0, 0), 0);
    expect(key('Tab', { shift: true }).defaultPrevented).toBe(true);
    type('x');
    expect(text(cell(0, 0))).toBe('x');

    caret(cell(2, 2), 0);
    key('Tab');
    type('new');

    expect(tableSize(getBlock, tableId)).toEqual({ rows: 4, columns: 3 });
    expect(text(cell(3, 0))).toBe('new');
    expect(validateSnapshot(editor.serialize(), editor.schema)).toEqual([]);
  });

  it('Tab outside a table keeps its usual meaning', () => {
    const { ids, caret, key, tableId, getBlock } = mountTable();

    caret(ids[0], 0);
    key('Tab');

    expect(tableSize(getBlock, tableId)).toEqual({ rows: 3, columns: 3 });
  });

  it('Enter adds a line in the cell; Backspace at its start changes nothing', () => {
    const { cell, caret, input, type, text, getBlock, tableId } = mountTable();

    caret(cell(1, 1), 0);
    type('a');
    input('insertParagraph');
    type('b');
    expect(text(cell(1, 1))).toBe('a\nb');

    caret(cell(1, 1), 0);
    input('deleteContentBackward');
    expect(text(cell(1, 1))).toBe('a\nb');
    expect(tableSize(getBlock, tableId)).toEqual({ rows: 3, columns: 3 });
  });

  it('typing "/" in a cell does not open the slash menu', () => {
    const { cell, caret, type, text } = mountTable();

    caret(cell(0, 0), 0);
    type('/');

    expect(text(cell(0, 0))).toBe('/');
    expect(document.querySelector('[data-inkbrick-ui="slash-menu"]')).toBeNull();
  });
});

describe('table slash item', () => {
  it('is offered in a paragraph, translated, and creates the table', () => {
    const { editor, ids, caret, type, key, root } = mountTable();
    const ru = createTranslator(resolveMessages({ locale: 'ru' }));
    const item = resolveSlashItems(controllerSlashItems(editor), ru).find(
      (entry) => entry.id === 'table',
    )!;

    expect(item.title).toBe('Таблица');
    expect(item.keywords).toContain('grid');
    expect(item.keywords).toContain('сетка');

    caret(ids[0], 6);
    type(' /table');
    expect(document.querySelector('[data-inkbrick-ui="slash-menu"]')).not.toBeNull();

    key('Enter');
    expect(root.querySelectorAll('[data-inkbrick-block="table"]')).toHaveLength(2);
  });
});
