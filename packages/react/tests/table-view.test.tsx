import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { locateTableCell, tableCellAt, type CaretResult } from '@inkbrick/engine';

import { tableBlocks } from '../src';
import { filterOpsFor, matchesFilter } from '../src/table/tableFilter';
import { mountEditor } from './harness';

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
  cleanup();
});

describe('matchesFilter', () => {
  it('compares text without case and multi-select values as a list', () => {
    expect(matchesFilter('Apple pie', 'text', { op: 'contains', value: 'PIE' })).toBe(true);
    expect(matchesFilter('Apple', 'text', { op: 'notContains', value: 'pie' })).toBe(true);
    expect(matchesFilter('apple', 'text', { op: 'equals', value: 'APPLE' })).toBe(true);
    expect(matchesFilter('a, b', 'multiselect', { op: 'equals', value: 'B' })).toBe(true);
    expect(matchesFilter('ab, c', 'multiselect', { op: 'equals', value: 'b' })).toBe(false);
    expect(matchesFilter('', 'text', { op: 'empty' })).toBe(true);
    expect(matchesFilter(' x ', 'text', { op: 'notEmpty' })).toBe(true);
  });

  it('compares numbers and dates as numbers and dates', () => {
    expect(matchesFilter('1 234,5', 'number', { op: 'gt', value: '1000' })).toBe(true);
    expect(matchesFilter('9', 'number', { op: 'gt', value: '10' })).toBe(false);
    expect(matchesFilter('9', 'number', { op: 'lt', value: '10' })).toBe(true);
    expect(matchesFilter('abc', 'number', { op: 'gt', value: '1' })).toBe(false);
    expect(matchesFilter('abc', 'number', { op: 'notEquals', value: '1' })).toBe(true);
    expect(matchesFilter('05.03.2024', 'date', { op: 'equals', value: '2024-03-05' })).toBe(true);
    expect(matchesFilter('2024-01-01', 'date', { op: 'lt', value: '2024-03-05' })).toBe(true);
  });

  it('handles checkboxes and does not hide anything while the value is not typed', () => {
    expect(matchesFilter('true', 'checkbox', { op: 'checked' })).toBe(true);
    expect(matchesFilter('', 'checkbox', { op: 'checked' })).toBe(false);
    expect(matchesFilter('', 'checkbox', { op: 'unchecked' })).toBe(true);
    expect(matchesFilter('anything', 'text', { op: 'contains', value: '' })).toBe(true);
    expect(matchesFilter('anything', 'number', { op: 'gt', value: 'abc' })).toBe(true);
  });

  it('offers conditions that make sense for the type', () => {
    expect(filterOpsFor('checkbox')).toEqual(['checked', 'unchecked']);
    expect(filterOpsFor('number')).toContain('gt');
    expect(filterOpsFor('text')).not.toContain('gt');
  });
});

function mountTable() {
  const mounted = mountEditor(['before'], { blocks: tableBlocks });
  const { editor, ids } = mounted;
  const getBlock = (id: string) => editor.document.getBlock(id);
  let made!: CaretResult;

  act(() => {
    made = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:table', afterId: ids[0] },
    }) as CaretResult;
  });

  const tableId = locateTableCell(getBlock, made.blockId)!.tableId;
  const cell = (row: number, column: number) => tableCellAt(getBlock, tableId, row, column)!;
  const text = (id: string) => editor.engine.inline.toPlainText(getBlock(id)!.content);
  const rows = () => [
    ...document.querySelectorAll<HTMLElement>('[data-inkbrick-block="table-row"]'),
  ];
  const td = (row: number, column: number) =>
    document.querySelector<HTMLElement>(`[data-block-id="${cell(row, column)}"]`)!;
  const set = (row: number, column: number, value: string) =>
    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: cell(row, column), from: 0, to: 0, text: value },
      });
    });
  const run = (type: string, payload: Record<string, unknown>) =>
    act(() => {
      editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);
    });

  [
    ['Name', 'Qty', 'Tag'],
    ['apple', '5', 'x'],
    ['pear', '20', 'y'],
  ].forEach((row, r) => row.forEach((value, c) => set(r, c, value)));

  const views = (list: unknown[]) => run('setTableViews', { views: list });

  return { ...mounted, tableId, cell, text, rows, td, run, set, views };
}

describe('table view: filters', () => {
  it('hides the rows that do not match, never the header, and shows how many in a bar', () => {
    const t = mountTable();

    t.run('setTableColumnType', { index: 1, type: 'number' });
    t.views([{ id: 'default', filters: [null, { op: 'gt', value: '10' }] }]);

    expect(t.rows().map((row) => row.hidden)).toEqual([false, true, false]);
    expect(document.querySelector('[data-testid="table-view-bar"]')!.textContent).toContain(
      'Filters: 1, rows hidden: 1',
    );

    t.views([]);
    expect(t.rows().every((row) => !row.hidden)).toBe(true);
    expect(document.querySelector('[data-testid="table-view-bar"]')).toBeNull();
  });

  it('combines filters of several columns with AND', () => {
    const t = mountTable();

    t.views([
      {
        id: 'default',
        filters: [{ op: 'contains', value: 'p' }, null, { op: 'equals', value: 'y' }],
      },
    ]);

    expect(t.rows().map((row) => row.hidden)).toEqual([false, true, false]);
  });

  it('keeps a row that is being edited until the filter or the rows change', () => {
    const t = mountTable();

    t.views([{ id: 'default', filters: [null, null, { op: 'equals', value: 'x' }] }]);
    expect(t.rows().map((row) => row.hidden)).toEqual([false, false, true]);

    act(() => {
      t.editor.dispatch({
        type: 'replaceText',
        payload: { blockId: t.cell(1, 2), from: 0, to: 1, text: 'z' },
      });
    });
    expect(t.rows()[1].hidden).toBe(false);

    t.run('insertTableRow', { index: 3 });
    expect(t.rows()[1].hidden).toBe(true);
  });

  it('"Show all" clears the filters and the hidden columns in one undo step', () => {
    const t = mountTable();

    t.views([
      {
        id: 'default',
        hidden: [false, true, false],
        filters: [null, null, { op: 'equals', value: 'x' }],
      },
    ]);
    t.editor.clearHistory();

    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-part="view-reset"]')!));

    expect(t.rows().every((row) => !row.hidden)).toBe(true);
    expect(document.querySelector('[data-testid="table-view-bar"]')).toBeNull();

    act(() => t.editor.store.undo());
    expect(document.querySelector('[data-testid="table-view-bar"]')).not.toBeNull();
  });
});

describe('table view: hidden columns', () => {
  it('hides every cell of the column, header included, and says how many are hidden', () => {
    const t = mountTable();

    t.views([{ id: 'default', hidden: [false, true, false] }]);

    expect([0, 1, 2].map((row) => t.td(row, 1).hidden)).toEqual([true, true, true]);
    expect(t.td(1, 0).hidden).toBe(false);
    expect(document.querySelector('[data-testid="table-view-bar"]')!.textContent).toContain(
      'Hidden columns: 1',
    );

    // Данные остаются.
    expect(t.text(t.cell(2, 1))).toBe('20');
  });

  it('a row inserted later has its cell in the hidden column hidden too', () => {
    const t = mountTable();

    t.views([{ id: 'default', hidden: [false, true, false] }]);
    t.run('insertTableRow', { index: 3 });

    expect(t.td(3, 1).hidden).toBe(true);
    expect(t.td(3, 0).hidden).toBe(false);
  });

  it('Tab skips hidden columns and filtered rows', () => {
    const t = mountTable();

    t.views([
      {
        id: 'default',
        hidden: [false, true, false],
        filters: [null, null, { op: 'equals', value: 'y' }],
      },
    ]);

    t.caret(t.cell(0, 0), 0);
    t.key('Tab');
    expect(getSelection()!.anchorNode!.parentElement!.closest('td')!.dataset.blockId).toBe(
      t.cell(0, 2),
    );

    t.key('Tab');
    // Строка «apple» скрыта фильтром: следующая видимая — «pear».
    expect(getSelection()!.anchorNode!.parentElement!.closest('td')!.dataset.blockId).toBe(
      t.cell(2, 0),
    );
  });
});

describe('table view: dialog', () => {
  const dialog = () => document.querySelector<HTMLElement>('[data-testid="column-properties"]');
  const part = (name: string) =>
    dialog()!.querySelector<HTMLElement & { value: string }>(`[data-inkbrick-part="${name}"]`)!;

  function openDialog(t: ReturnType<typeof mountTable>, column: number) {
    act(() => t.caret(t.cell(2, column), 0));
    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-part="column-grip"]')!));
    act(
      () =>
        void fireEvent.click(
          document.querySelector('[data-testid="block-menu"] [data-action="column-properties"]')!,
        ),
    );
  }

  it('sets a filter with a value together with the type, and a type without the condition drops it', () => {
    const t = mountTable();

    openDialog(t, 1);
    act(() => void fireEvent.change(part('type'), { target: { value: 'number' } }));
    act(() => void fireEvent.change(part('filter-op'), { target: { value: 'gt' } }));
    act(() => void fireEvent.change(part('filter-value'), { target: { value: '10' } }));
    act(() => void fireEvent.click(part('apply')));

    expect(t.rows().map((row) => row.hidden)).toEqual([false, true, false]);

    openDialog(t, 1);
    expect(part('filter-op').value).toBe('gt');
    act(() => void fireEvent.change(part('type'), { target: { value: 'checkbox' } }));
    expect(part('filter-op').value).toBe('');
    act(() => void fireEvent.click(part('apply')));

    expect(t.rows().every((row) => !row.hidden)).toBe(true);
  });

  it('the column menu hides a column', () => {
    const t = mountTable();

    act(() => t.caret(t.cell(1, 2), 0));
    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-part="column-grip"]')!));
    act(
      () =>
        void fireEvent.click(
          document.querySelector('[data-testid="block-menu"] [data-action="column-hide"]')!,
        ),
    );

    expect(t.td(1, 2).hidden).toBe(true);
  });
});

describe('table views: several views', () => {
  const bar = () => document.querySelector<HTMLElement>('[data-testid="table-view-bar"]');
  const tabs = () => [...document.querySelectorAll<HTMLElement>('[data-inkbrick-part="view-tab"]')];
  const tab = (name: string) => tabs().find((node) => node.textContent === name)!;
  const click = (element: Element) => act(() => void fireEvent.click(element));
  const names = (t: ReturnType<typeof mountTable>) =>
    t.rows().map((row) => row.querySelector('td')!.textContent);

  const twoViews = (t: ReturnType<typeof mountTable>) =>
    t.views([
      { id: 'all', name: 'All' },
      { id: 'big', name: 'Big', filters: [null, { op: 'gt', value: '10' }] },
    ]);

  it('shows no bar for a plain table and a tab per view when there are several', () => {
    const t = mountTable();

    expect(bar()).toBeNull();

    twoViews(t);
    expect(tabs().map((node) => node.textContent)).toEqual(['All', 'Big']);
    expect(tab('All').getAttribute('aria-selected')).toBe('true');
  });

  it('each view keeps its own filters and switching is not a document change', () => {
    const t = mountTable();

    t.run('setTableColumnType', { index: 1, type: 'number' });
    twoViews(t);
    expect(t.rows().every((row) => !row.hidden)).toBe(true);

    t.editor.clearHistory();
    click(tab('Big'));

    expect(t.rows().map((row) => row.hidden)).toEqual([false, true, false]);
    expect(t.editor.canUndo).toBe(false);

    click(tab('All'));
    expect(t.rows().every((row) => !row.hidden)).toBe(true);
  });

  it('a view sort changes the order of the rows on screen, not in the document', () => {
    const t = mountTable();

    t.run('setTableColumnType', { index: 1, type: 'number' });
    t.views([
      { id: 'a', name: 'Doc order' },
      { id: 'b', name: 'By qty', sort: { column: 1, direction: 'desc' } },
    ]);
    expect(names(t)).toEqual(['Name', 'apple', 'pear']);

    click(tab('By qty'));
    expect(names(t)).toEqual(['Name', 'pear', 'apple']);
    expect(t.text(t.cell(1, 0))).toBe('apple');
  });

  it('adds a view from the bar, renames it by double click and deletes it', () => {
    const t = mountTable();

    t.views([{ id: 'a', name: 'One' }, { id: 'b' }]);
    click(document.querySelector('[data-inkbrick-part="view-add"]')!);
    expect(tabs()).toHaveLength(3);
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');

    act(() => void fireEvent.doubleClick(tabs()[2]));

    const input = document.querySelector<HTMLInputElement>('[data-inkbrick-part="view-rename"]')!;

    act(() => void fireEvent.change(input, { target: { value: 'Mine' } }));
    act(() => void fireEvent.keyDown(input, { key: 'Enter' }));
    expect(tabs()[2].textContent).toBe('Mine');

    click(document.querySelector('[data-inkbrick-part="view-delete"]')!);
    expect(tabs().map((node) => node.textContent)).toEqual(['One', 'Table']);
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('the column menu adds a view and sorts the open view without touching the data', () => {
    const t = mountTable();

    act(() => t.caret(t.cell(1, 1), 0));
    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-part="column-grip"]')!));
    act(
      () =>
        void fireEvent.click(
          document.querySelector('[data-testid="block-menu"] [data-action="view-add"]')!,
        ),
    );
    expect(tabs()).toHaveLength(2);

    act(() => t.caret(t.cell(1, 0), 0));
    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-part="column-grip"]')!));
    act(
      () =>
        void fireEvent.click(
          document.querySelector('[data-testid="block-menu"] [data-action="column-view-sort"]')!,
        ),
    );

    expect(names(t)).toEqual(['Name', 'apple', 'pear']);

    act(() => t.caret(t.cell(1, 0), 0));
    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-part="column-grip"]')!));
    act(
      () =>
        void fireEvent.click(
          document.querySelector('[data-testid="block-menu"] [data-action="column-view-sort"]')!,
        ),
    );
    expect(names(t)).toEqual(['Name', 'pear', 'apple']);
    expect(t.text(t.cell(1, 0))).toBe('apple');
  });

  it('"Show all" clears the open view but keeps its name and its tab', () => {
    const t = mountTable();

    twoViews(t);
    click(tab('Big'));
    click(document.querySelector('[data-inkbrick-part="view-reset"]')!);

    expect(t.rows().every((row) => !row.hidden)).toBe(true);
    expect(tab('Big')).toBeTruthy();
  });
});
