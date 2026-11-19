import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { validateSnapshot } from '@inkbrick/document';
import {
  MAX_TABLE_COLUMNS,
  locateTableCell,
  tableCellAt,
  tableSize,
  type CaretResult,
} from '@inkbrick/engine';

import { tableBlocks } from '../src';
import { mountEditor } from './harness';

beforeEach(() => {
  // jsdom не знает elementFromPoint: он нужен ручке блока при любом движении мыши.
  document.elementFromPoint = () => null;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
  Reflect.deleteProperty(document, 'elementsFromPoint');
  cleanup();
});

function mountTable(props: Parameters<typeof mountEditor>[1] = {}) {
  const mounted = mountEditor(['before'], { blocks: tableBlocks, ...props });
  const { editor, ids, caret } = mounted;
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
  const size = () => tableSize(getBlock, tableId)!;

  act(() => {
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        editor.dispatch({
          type: 'replaceText',
          payload: { blockId: cell(r, c), from: 0, to: 0, text: `${r}${c}` },
        });
  });

  const grid = () =>
    getBlock(tableId)!.children.map((rowId) =>
      getBlock(rowId)!.children.map((cellId) => text(cellId)),
    );
  /** Каретка в ячейке: управление показывается по ней. */
  const focus = (row: number, column: number) => caret(cell(row, column), 0);
  const $ = (part: string) =>
    document.querySelector<HTMLElement>(
      `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${part}"]`,
    );
  const $$ = (part: string) => [
    ...document.querySelectorAll<HTMLElement>(
      `[data-inkbrick-ui="table-controls"][data-inkbrick-part="${part}"]`,
    ),
  ];
  const menu = () => document.querySelector<HTMLElement>('[data-testid="block-menu"]');
  const action = (id: string) => menu()!.querySelector<HTMLElement>(`[data-action="${id}"]`)!;
  const click = (element: HTMLElement) => act(() => void fireEvent.click(element));
  const tableProps = () =>
    getBlock(tableId)!.props as {
      header: boolean;
      freezeRow?: boolean;
      freezeColumn?: boolean;
      columnTypes?: string[];
      widths?: (number | null)[];
    };

  return {
    ...mounted,
    tableId,
    cell,
    text,
    size,
    grid,
    focus,
    $,
    $$,
    menu,
    action,
    click,
    tableProps,
    getBlock,
  };
}

describe('table controls: visibility', () => {
  it('shows the grips, the markers on the boundaries and a resize handle per column while the caret is in the table', () => {
    const { focus, $, $$ } = mountTable();

    focus(1, 2);

    expect($('row-grip')!.getAttribute('aria-label')).toBe('Row 2: click for options');
    expect($('column-grip')!.getAttribute('aria-label')).toBe('Column 3: click for options');
    expect($$('row-insert')).toHaveLength(2);
    expect($$('column-insert')).toHaveLength(2);
    expect($('add-row')).toBeNull();
    expect($$('resize')).toHaveLength(3);
  });

  it('is hidden with the caret outside the table and in read-only mode', () => {
    const { ids, caret, $, $$ } = mountTable();

    caret(ids[0], 0);
    expect($('row-grip')).toBeNull();
    expect($('row-insert')).toBeNull();
    expect($$('resize')).toHaveLength(0);

    cleanup();

    const readOnly = mountTable();

    act(() => readOnly.editor.setReadOnly(true));
    readOnly.focus(0, 0);
    expect(readOnly.$('row-grip')).toBeNull();
    expect(readOnly.$('column-insert')).toBeNull();
  });

  it('the controls stay out of the editable root, so selection and copying never see them', () => {
    const { focus, root, $ } = mountTable();

    focus(0, 0);

    expect(root.contains($('row-grip'))).toBe(false);
    expect($('row-grip')!.parentElement).toBe(document.body);
  });

  it('follows the mouse: the strips belong to the row and column under the pointer', async () => {
    const { root, cell, $, getBlock, tableId } = mountTable();
    const table = root.querySelector('table')!;
    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this === table ? rect(100, 100, 300, 90) : rect(0, 0, 0, 0);
    });

    const target = root.querySelector(`[data-block-id="${cell(2, 1)}"]`)!;

    document.elementsFromPoint = () => [target];

    await act(async () => {
      document.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 250, clientY: 160 }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect($('row-grip')!.getAttribute('aria-label')).toContain('Row 3');
    expect($('column-grip')!.getAttribute('aria-label')).toContain('Column 2');

    // Далеко от таблицы управление исчезает.
    await act(async () => {
      document.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 900, clientY: 900 }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect($('row-grip')).toBeNull();
    expect(getBlock(tableId)).toBeDefined();
    delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
  });
});

describe('table controls: markers on the boundaries', () => {
  it('the lower marker of the last row appends a row', () => {
    const { focus, $$, click, size, grid, editor } = mountTable();

    focus(2, 0);
    click($$('row-insert')[1]);

    expect(size()).toEqual({ rows: 4, columns: 3 });
    expect(grid()[3]).toEqual(['', '', '']);
    expect(validateSnapshot(editor.serialize(), editor.schema)).toEqual([]);
  });

  it('the right marker of a column inserts a column; it is one undo step', () => {
    const { focus, $$, click, size, editor } = mountTable();

    focus(1, 1);
    click($$('column-insert')[1]);
    expect(size()).toEqual({ rows: 3, columns: 4 });

    editor.undo();
    expect(size()).toEqual({ rows: 3, columns: 3 });
  });

  it('are disabled at the size limits', () => {
    const { editor, tableId, focus, $$ } = mountTable();

    act(() => {
      for (let c = 3; c < MAX_TABLE_COLUMNS; c++)
        editor.dispatch({
          type: 'insertTableColumn',
          payload: { blockId: tableId, index: c },
        } as never);
    });
    focus(0, 0);

    expect(($$('column-insert')[1] as HTMLButtonElement).disabled).toBe(true);
    expect(($$('row-insert')[1] as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('table controls: row menu', () => {
  const openColumn = (t: ReturnType<typeof mountTable>, column: number) => {
    t.focus(1, column);
    t.click(t.$('column-grip')!);
  };

  const open = (t: ReturnType<typeof mountTable>, row: number) => {
    t.focus(row, 1);
    t.click(t.$('row-grip')!);
  };

  it('opens from the row strip and lists the row actions', () => {
    const t = mountTable();

    open(t, 0);

    expect(
      [...t.menu()!.querySelectorAll('[data-action]')].map((item) =>
        item.getAttribute('data-action'),
      ),
    ).toEqual([
      'row-select',
      'row-insert-above',
      'row-insert-below',
      'row-move-up',
      'row-move-down',
      'row-header',
      'row-freeze',
      'row-delete',
    ]);
    // У первой строки нельзя подняться выше; «заголовок» есть только у неё.
    expect(t.action('row-move-up').getAttribute('aria-disabled')).toBe('true');
    expect(t.action('row-move-down').getAttribute('aria-disabled')).toBeNull();
  });

  it('inserts above and below the row and closes the menu', () => {
    const t = mountTable();

    open(t, 1);
    t.click(t.action('row-insert-above'));
    expect(t.grid().map((row) => row[0])).toEqual(['00', '', '10', '20']);
    expect(t.menu()).toBeNull();

    open(t, 2);
    t.click(t.action('row-insert-below'));
    expect(t.grid().map((row) => row[0])).toEqual(['00', '', '10', '', '20']);
  });

  it('moves a row up and down', () => {
    const t = mountTable();

    open(t, 1);
    t.click(t.action('row-move-down'));
    expect(t.grid().map((row) => row[0])).toEqual(['00', '20', '10']);

    open(t, 2);
    t.click(t.action('row-move-up'));
    expect(t.grid().map((row) => row[0])).toEqual(['00', '10', '20']);
  });

  it('toggles the header row from the first row only', () => {
    const t = mountTable();

    open(t, 1);
    expect(t.menu()!.querySelector('[data-action="row-header"]')).toBeNull();
    act(() => void fireEvent.pointerDown(document.body));

    cleanup();

    const first = mountTable();

    open(first, 0);
    expect(first.action('row-header').textContent).toContain('regular row');
    first.click(first.action('row-header'));
    expect(first.tableProps().header).toBe(false);

    open(first, 0);
    expect(first.action('row-header').textContent).toContain('header');
    first.click(first.action('row-header'));
    expect(first.tableProps().header).toBe(true);
  });

  it('sets the column type and sorts the rows by it from the column menu', () => {
    const t = mountTable();

    openColumn(t, 1);
    expect(t.action('column-type-text').querySelector('svg')).not.toBeNull();
    t.click(t.action('column-type-number'));
    expect(t.tableProps().columnTypes).toEqual(['text', 'number', 'text']);

    openColumn(t, 1);
    t.click(t.action('column-sort-desc'));
    expect(t.grid().map((row) => row[1])).toEqual(['01', '21', '11']);

    openColumn(t, 1);
    expect(t.action('column-sort-desc').getAttribute('aria-disabled')).toBe('true');
    t.click(t.action('column-sort-asc'));
    expect(t.grid().map((row) => row[1])).toEqual(['01', '11', '21']);
  });

  it('keeps the first row and the first column in view, from their own menus', () => {
    const t = mountTable();
    const frozen = (name: string) =>
      document.querySelector('[data-inkbrick-block="table"]')!.hasAttribute(name);

    open(t, 0);
    expect(t.action('row-freeze').textContent).toBe('Keep first row in view');
    t.click(t.action('row-freeze'));
    expect(t.tableProps().freezeRow).toBe(true);
    expect(frozen('data-freeze-row')).toBe(true);

    open(t, 0);
    expect(t.action('row-freeze').textContent).toBe('Stop keeping first row in view');
    t.click(t.action('row-freeze'));
    expect(frozen('data-freeze-row')).toBe(false);

    openColumn(t, 0);
    t.click(t.action('column-freeze'));
    expect(t.tableProps().freezeColumn).toBe(true);
    expect(frozen('data-freeze-column')).toBe(true);

    openColumn(t, 1);
    expect(t.menu()!.querySelector('[data-action="column-freeze"]')).toBeNull();
  });

  it('deletes the row, but not the last one', () => {
    const t = mountTable();

    open(t, 2);
    t.click(t.action('row-delete'));
    expect(t.grid()).toHaveLength(2);

    open(t, 1);
    t.click(t.action('row-delete'));
    open(t, 0);
    expect(t.grid()).toHaveLength(1);
    expect(t.action('row-delete').getAttribute('aria-disabled')).toBe('true');
  });

  it('every action is a single undo step', () => {
    const t = mountTable();

    open(t, 1);
    t.click(t.action('row-delete'));
    t.editor.undo();

    expect(t.grid()).toHaveLength(3);
    expect(t.grid()[1]).toEqual(['10', '11', '12']);
  });

  it('the strip toggles the menu; a press outside and Escape close it', () => {
    const t = mountTable();

    open(t, 1);
    expect(t.menu()).not.toBeNull();
    t.click(t.$('row-grip')!);
    expect(t.menu()).toBeNull();

    open(t, 1);
    act(() => void fireEvent.pointerDown(document.body));
    expect(t.menu()).toBeNull();

    open(t, 1);
    act(() => void fireEvent.keyDown(t.menu()!, { key: 'Escape' }));
    expect(t.menu()).toBeNull();
  });
});

describe('table controls: column menu', () => {
  const open = (t: ReturnType<typeof mountTable>, column: number) => {
    t.focus(1, column);
    t.click(t.$('column-grip')!);
  };

  it('inserts left and right of the column', () => {
    const t = mountTable();

    open(t, 1);
    t.click(t.action('column-insert-left'));
    expect(t.grid()[0]).toEqual(['00', '', '01', '02']);

    open(t, 3);
    t.click(t.action('column-insert-right'));
    expect(t.grid()[0]).toEqual(['00', '', '01', '02', '']);
  });

  it('moves columns, not past the edges', () => {
    const t = mountTable();

    open(t, 0);
    expect(t.action('column-move-left').getAttribute('aria-disabled')).toBe('true');
    t.click(t.action('column-move-right'));
    expect(t.grid()[0]).toEqual(['01', '00', '02']);

    open(t, 2);
    expect(t.action('column-move-right').getAttribute('aria-disabled')).toBe('true');
    t.click(t.action('column-move-left'));
    expect(t.grid()[0]).toEqual(['01', '02', '00']);
  });

  it('aligns every cell of the column', () => {
    const t = mountTable();

    open(t, 1);
    t.click(t.action('column-align-center'));

    for (let r = 0; r < 3; r++) {
      expect(t.getBlock(t.cell(r, 1))!.props).toMatchObject({ align: 'center' });
      expect(t.getBlock(t.cell(r, 0))!.props).not.toHaveProperty('align', 'center');
    }

    open(t, 1);
    t.click(t.action('column-align-right'));
    expect(t.getBlock(t.cell(2, 1))!.props).toMatchObject({ align: 'right' });
  });

  it('alignment of a whole column is one undo step', () => {
    const t = mountTable();

    open(t, 2);
    t.click(t.action('column-align-center'));
    t.editor.undo();

    expect(t.getBlock(t.cell(1, 2))!.props).not.toHaveProperty('align', 'center');
  });

  it('automatic width is available once the column has a width, and clears it', () => {
    const t = mountTable();

    open(t, 1);
    expect(t.action('column-auto-width').getAttribute('aria-disabled')).toBe('true');
    act(() => void fireEvent.pointerDown(document.body));

    act(() => {
      t.editor.dispatch({
        type: 'setTableColumnWidth',
        payload: { blockId: t.tableId, index: 1, width: 140 },
      } as never);
    });
    open(t, 1);
    t.click(t.action('column-auto-width'));

    expect(t.tableProps().widths).toBeUndefined();
  });

  it('deletes the column, but not the last one', () => {
    const t = mountTable();

    open(t, 1);
    t.click(t.action('column-delete'));
    expect(t.grid()[0]).toEqual(['00', '02']);

    open(t, 0);
    t.click(t.action('column-delete'));
    open(t, 0);
    expect(t.action('column-delete').getAttribute('aria-disabled')).toBe('true');
  });
});

describe('table controls: resizing', () => {
  /** Ширина первой ячейки — 100px: от неё считается, на сколько растянули столбец. */
  function stubWidth(width = 100) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const w = this.tagName === 'TD' ? width : 0;

      return {
        left: 0,
        top: 0,
        width: w,
        height: 0,
        right: w,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
  }

  const drag = (t: ReturnType<typeof mountTable>, column: number, dx: number) => {
    const handle = t.$$('resize')[column];

    act(() => void fireEvent.pointerDown(handle, { button: 0, clientX: 300, clientY: 50 }));
    const frame = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => (callback(0), 1));

    act(
      () =>
        void document.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: 300 + dx }),
        ),
    );
    frame.mockRestore();
  };

  it('coalesces pointer moves into one preview per frame', () => {
    stubWidth();

    const t = mountTable();

    t.focus(0, 0);

    const callbacks: FrameRequestCallback[] = [];
    const frame = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => callbacks.push(callback));

    act(() => void fireEvent.pointerDown(t.$$('resize')[1], { button: 0, clientX: 300 }));
    act(() => {
      for (const dx of [10, 20, 30])
        document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 300 + dx }));
    });

    expect(callbacks).toHaveLength(1);

    act(() => callbacks[0](0));
    frame.mockRestore();

    const widths = [...document.querySelectorAll<HTMLElement>('col')].map((col) => col.style.width);

    expect(widths.some((width) => width.endsWith('px'))).toBe(true);
  });

  it('dragging a handle previews the width and writes it on release in one undo step', () => {
    stubWidth();

    const t = mountTable();

    t.focus(0, 0);
    drag(t, 1, 60);

    const cols = () =>
      [...t.root.querySelectorAll<HTMLElement>('col')].map((col) => col.style.width);

    // Тянут границу между вторым и третьим столбцами: меняются только они, первый стоит.
    expect(cols()).toEqual(['100px', '160px', '40px']);
    expect(t.tableProps().widths).toBeUndefined();

    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));

    expect(t.tableProps().widths).toEqual([100, 160, 40]);
    expect(cols()).toEqual(['100px', '160px', '40px']);

    t.editor.undo();
    expect(t.tableProps().widths).toBeUndefined();
  });

  it('keeps the width between 40 and 1200 pixels', () => {
    stubWidth();

    const t = mountTable();

    t.focus(0, 0);
    drag(t, 2, -500);
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(t.tableProps().widths?.[2]).toBe(40);

    drag(t, 2, 5000);
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(t.tableProps().widths?.[2]).toBe(1200);
  });

  it('a border between columns moves width only between its two neighbours', () => {
    stubWidth();

    const t = mountTable();

    t.focus(0, 0);
    drag(t, 0, -500);
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    // Первый столбец не уже 40, второй получил всё освобождённое, третий не тронут; сумма прежняя.
    expect(t.tableProps().widths).toEqual([40, 160, 100]);

    drag(t, 0, 5000);
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    // Второй столбец не уже 40: первый забирает остальное.
    expect(t.tableProps().widths).toEqual([160, 40, 100]);
  });

  it('the table is as wide as its columns once all of them have a width', () => {
    stubWidth();

    const t = mountTable();

    t.focus(0, 0);
    drag(t, 2, 50);
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));

    const grid = t.root.querySelector<HTMLElement>('[data-inkbrick-part="grid"]')!;

    // 100 + 100 + 150: растянули край последнего столбца — выросла и таблица.
    expect(grid.style.width).toBe('350px');
  });

  it('a click without movement changes nothing', () => {
    stubWidth();

    const t = mountTable();

    t.editor.clearHistory();
    t.focus(0, 0);
    drag(t, 2, 0);
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));

    expect(t.tableProps().widths).toBeUndefined();
    expect(t.editor.canUndo).toBe(false);
  });

  it('a cancelled drag still ends cleanly; other buttons do not start one', () => {
    stubWidth();

    const t = mountTable();

    t.focus(0, 0);
    act(() => void fireEvent.pointerDown(t.$$('resize')[0], { button: 2, clientX: 0 }));
    act(
      () =>
        void document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 90 })),
    );
    expect(t.root.querySelector('colgroup')).toBeNull();

    drag(t, 0, 30);
    act(() => void document.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true })));
    expect(t.tableProps().widths).toEqual([130, 70, 100]);
  });

  it('arrow keys change the width by ten pixels and a double click resets it', () => {
    stubWidth();

    const t = mountTable();

    t.focus(0, 0);
    act(() => void fireEvent.keyDown(t.$$('resize')[1], { key: 'ArrowRight' }));
    expect(t.tableProps().widths).toEqual([100, 110, 90]);

    // Ширина читается с экрана (в заглушке всегда 100), поэтому второй шаг считается от неё же.
    act(() => void fireEvent.keyDown(t.$$('resize')[1], { key: 'ArrowLeft' }));
    expect(t.tableProps().widths).toEqual([100, 90, 110]);

    act(() => void fireEvent.keyDown(t.$$('resize')[1], { key: 'a' }));
    expect(t.tableProps().widths).toEqual([100, 90, 110]);

    act(() => void fireEvent.doubleClick(t.$$('resize')[1]));
    expect(t.tableProps().widths).toEqual([100, null, 110]);

    // Без заданной ширины двойной клик ничего не делает.
    cleanup();

    const fresh = mountTable();

    fresh.focus(0, 0);
    act(() => void fireEvent.doubleClick(fresh.$$('resize')[0]));
    expect(fresh.tableProps().widths).toBeUndefined();
  });
});
