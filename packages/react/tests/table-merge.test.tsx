import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { createTableEditor, tableIdOf, tableValue } from '@inkbrick/engine';

import { TableEditor, tableKeymap } from '../src';
import { preloadContextMenu } from '../src/context-menu/ContextMenuHost';
import './harness';
import { render } from '@testing-library/react';

beforeAll(async () => {
  await preloadContextMenu();
});

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
  cleanup();
});

function mount() {
  const editor = createTableEditor({
    rows: [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ],
  });
  const view = render(<TableEditor editor={editor} formulaRenderer={false} highlighter={false} />);
  const root = view.container.querySelector<HTMLElement>('[data-inkbrick-root]')!;
  const tableId = tableIdOf(editor)!;
  const td = (row: number, column: number) =>
    root.querySelectorAll('tr')[row].querySelectorAll('td')[column] as HTMLTableCellElement;
  const merges = () => editor.document.getBlock(tableId)!.props.merges;

  const drag = (from: [number, number], to: [number, number]) => {
    act(() => void fireEvent.pointerDown(td(...from), { button: 0 }));
    document.elementFromPoint = () => td(...to);
    act(
      () =>
        void document.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 5, clientY: 5 }),
        ),
    );
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
  };

  const menu = () => document.querySelector<HTMLElement>('[data-testid="context-menu"]');
  const item = (id: string) =>
    menu()!.querySelector<HTMLElement>(`[data-inkbrick-part="item"][data-action="${id}"]`);
  const openMenu = (target: HTMLElement) =>
    act(() => void fireEvent.contextMenu(target, { clientX: 40, clientY: 20 }));

  return { editor, root, tableId, td, merges, drag, menu, item, openMenu };
}

describe('merged cells in the table', () => {
  it('merges the dragged cells from the right-click menu and draws one wide cell', () => {
    const t = mount();

    t.drag([0, 0], [1, 1]);
    t.openMenu(t.td(0, 0));

    expect(t.item('table-merge')).not.toBeNull();
    expect(t.item('table-split')).toBeNull();

    act(() => void fireEvent.click(t.item('table-merge')!));

    expect(t.merges()).toEqual([{ row: 0, column: 0, rows: 2, columns: 2 }]);
    expect(t.td(0, 0).colSpan).toBe(2);
    expect(t.td(0, 0).rowSpan).toBe(2);
    expect(t.td(0, 1).hidden).toBe(true);
    expect(t.td(1, 0).hidden).toBe(true);
    expect(t.td(1, 1).hidden).toBe(true);
    expect(t.td(0, 2).hidden).toBe(false);
    expect(tableValue(t.editor).rows[0][0]).toBe('a\nb\nd\ne');
    expect(document.querySelectorAll('td[data-cell-selected]')).toHaveLength(0);
  });

  it('splits it back from the menu of a caret inside the merged cell', () => {
    const t = mount();

    t.drag([0, 0], [0, 1]);
    t.openMenu(t.td(0, 0));
    act(() => void fireEvent.click(t.item('table-merge')!));

    const editable = t.td(0, 0).querySelector<HTMLElement>('.editable')!;

    act(() => {
      const range = document.createRange();

      range.setStart(editable.firstChild!, 1);
      range.collapse(true);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    });
    t.openMenu(editable);
    expect(t.item('table-merge')).toBeNull();

    act(() => void fireEvent.click(t.item('table-split')!));
    expect(t.merges()).toBeUndefined();
    expect(t.td(0, 1).hidden).toBe(false);
  });

  it('selecting across a merged cell takes all of it', () => {
    const t = mount();

    t.drag([1, 0], [1, 1]);
    t.openMenu(t.td(1, 0));
    act(() => void fireEvent.click(t.item('table-merge')!));

    t.drag([0, 1], [1, 1]);

    expect(
      [...document.querySelectorAll('td[data-cell-selected]')].map((cell) =>
        cell.getAttribute('data-block-id'),
      ),
    ).toEqual(
      [t.td(0, 0), t.td(0, 1), t.td(1, 0)].map((cell) => cell.getAttribute('data-block-id')),
    );
  });

  it('Tab skips the covered cells', () => {
    const t = mount();
    const binding = tableKeymap.find((item) => item.id === 'table.nextCell')!;

    t.drag([0, 0], [0, 1]);
    t.openMenu(t.td(0, 0));
    act(() => void fireEvent.click(t.item('table-merge')!));

    const editable = t.td(0, 0).querySelector<HTMLElement>('.editable')!;
    const caretAt = (element: HTMLElement) => {
      const range = document.createRange();

      range.selectNodeContents(element);
      range.collapse(false);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    };

    act(() => caretAt(editable));
    act(() => void fireEvent.keyDown(t.root, { key: 'Tab' }));

    const anchor = document.getSelection()!.anchorNode;

    expect(t.td(0, 2).contains(anchor)).toBe(true);
    expect(binding).toBeDefined();
  });

  it('keeps the merge with its rows when rows are added above', () => {
    const t = mount();

    t.drag([1, 1], [2, 2]);
    t.openMenu(t.td(1, 1));
    act(() => void fireEvent.click(t.item('table-merge')!));

    act(() => {
      t.editor.dispatch({
        type: 'insertTableRow',
        payload: { blockId: t.tableId, index: 0 },
      } as never);
    });

    expect(t.td(2, 1).colSpan).toBe(2);
    expect(t.td(2, 1).rowSpan).toBe(2);
    expect(t.td(3, 2).hidden).toBe(true);
  });
});
