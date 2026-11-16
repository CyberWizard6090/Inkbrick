import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { FRAGMENT_MIME, locateTableCell, tableCellAt, type CaretResult } from '@inkbrick/engine';

import { tableBlocks } from '../src';
import { mountEditor } from './harness';

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
  cleanup();
});

function mountTable() {
  const mounted = mountEditor(['before'], { blocks: tableBlocks });
  const { editor, ids, root, editable } = mounted;
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
  const td = (row: number, column: number) =>
    root.querySelector<HTMLElement>(`td[data-block-id="${cell(row, column)}"]`)!;
  const text = (id: string) => editor.engine.inline.toPlainText(getBlock(id)!.content);

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
  const picked = () =>
    [...root.querySelectorAll<HTMLElement>('td[data-cell-selected]')].map(
      (element) => getBlock(element.dataset.blockId!)!.id,
    );

  /** Протягивание от одной ячейки к другой: курсор «над» ячейкой задаёт заглушка elementFromPoint. */
  const drag = (from: [number, number], to: [number, number]) => {
    act(() => void fireEvent.pointerDown(td(...from), { button: 0 }));
    document.elementFromPoint = () => editable(cell(...to)).closest('td');
    act(
      () =>
        void document.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 5, clientY: 5 }),
        ),
    );
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  };

  const key = (name: string, init: KeyboardEventInit = {}) => {
    let event!: KeyboardEvent;

    act(() => {
      event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
      root.dispatchEvent(event);
    });

    return event;
  };

  return { ...mounted, tableId, cell, td, text, grid, picked, drag, key };
}

describe('table cell selection', () => {
  it('dragging from one cell to another selects the rectangle between them', () => {
    const t = mountTable();

    t.drag([0, 0], [1, 1]);

    expect(t.picked()).toEqual([t.cell(0, 0), t.cell(0, 1), t.cell(1, 0), t.cell(1, 1)]);
    expect(document.getSelection()?.isCollapsed ?? true).toBe(true);
  });

  it('a plain click selects no cells and a click elsewhere drops the selection', () => {
    const t = mountTable();

    act(() => void fireEvent.pointerDown(t.td(0, 0), { button: 0 }));
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(t.picked()).toEqual([]);

    t.drag([0, 0], [0, 2]);
    expect(t.picked()).toHaveLength(3);

    act(() => void fireEvent.pointerDown(document.body));
    expect(t.picked()).toEqual([]);
  });

  it('Shift+click and Shift+arrows extend the selection, a plain arrow leaves it', () => {
    const t = mountTable();

    t.drag([0, 0], [0, 1]);
    act(() => void fireEvent.pointerDown(t.td(2, 2), { button: 0, shiftKey: true }));
    expect(t.picked()).toHaveLength(9);

    cleanup();

    const u = mountTable();

    u.drag([0, 0], [0, 1]);
    u.key('ArrowDown', { shiftKey: true });
    expect(u.picked()).toHaveLength(4);

    u.key('ArrowRight');
    expect(u.picked()).toEqual([]);
    expect(document.getSelection()?.anchorNode).not.toBeNull();
  });

  it('Delete clears the text of the selected cells in one undo step', () => {
    const t = mountTable();

    t.drag([0, 0], [1, 1]);
    t.key('Delete');

    expect(t.grid()).toEqual([
      ['', '', '02'],
      ['', '', '12'],
      ['20', '21', '22'],
    ]);
    expect(t.picked()).toHaveLength(4);

    act(() => void t.editor.undo());
    expect(t.grid()[0]).toEqual(['00', '01', '02']);
    expect(t.grid()[1]).toEqual(['10', '11', '12']);
  });

  it('copies the selected cells as a table: text, html and the exact fragment', () => {
    const t = mountTable();
    const store: Record<string, string> = {};
    const event = new Event('copy', { bubbles: true, cancelable: true });

    t.drag([1, 0], [2, 1]);
    Object.defineProperty(event, 'clipboardData', {
      value: { setData: (type: string, value: string) => (store[type] = value) },
    });
    act(() => void t.root.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(store['text/plain']).toBe('10\t11\n20\t21');
    expect(store['text/html']).toContain('<table>');
    expect(JSON.parse(store[FRAGMENT_MIME]).blocks[0].flavour).toBe('block:table');
    expect(JSON.parse(store[FRAGMENT_MIME]).blocks[0].props.header).toBe(false);
  });

  it('cut copies and clears; the first row keeps the header when it is part of the range', () => {
    const t = mountTable();
    const store: Record<string, string> = {};
    const event = new Event('cut', { bubbles: true, cancelable: true });

    t.drag([0, 0], [0, 1]);
    Object.defineProperty(event, 'clipboardData', {
      value: { setData: (type: string, value: string) => (store[type] = value) },
    });
    act(() => void t.root.dispatchEvent(event));

    expect(JSON.parse(store[FRAGMENT_MIME]).blocks[0].props.header).toBe(true);
    expect(t.grid()[0]).toEqual(['', '', '02']);
  });

  it('paste puts the caret into the top left cell before the paste is handled', () => {
    const t = mountTable();

    t.drag([1, 1], [2, 2]);
    act(() => void t.root.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true })));

    expect(t.picked()).toEqual([]);

    const anchor = document.getSelection()?.anchorNode;

    expect(t.td(1, 1).contains(anchor ?? null)).toBe(true);
  });

  it('typing a character or Escape returns the caret to the cell', () => {
    const t = mountTable();

    t.drag([1, 1], [2, 2]);
    t.key('x');
    expect(t.picked()).toEqual([]);
    expect(t.td(1, 1).contains(document.getSelection()?.anchorNode ?? null)).toBe(true);

    t.drag([0, 0], [0, 1]);
    t.key('Escape');
    expect(t.picked()).toEqual([]);
    expect(t.td(0, 1).contains(document.getSelection()?.anchorNode ?? null)).toBe(true);
  });

  it('is not started in a read-only editor', () => {
    const t = mountTable();

    act(() => t.editor.setReadOnly(true));
    t.drag([0, 0], [1, 1]);

    expect(t.picked()).toEqual([]);
  });
});
