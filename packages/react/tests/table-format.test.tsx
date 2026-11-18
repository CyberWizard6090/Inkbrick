import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import { createTableEditor, tableIdOf } from '@inkbrick/engine';

import { TableEditor } from '../src';
import { tableRangeFormats } from '../src/table/cellFormatting';
import { preloadContextMenu } from '../src/context-menu/ContextMenuHost';
import './harness';

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
  const block = () => editor.document.getBlock(tableId)!;
  const cellBlock = (row: number, column: number) =>
    editor.document.getBlock(editor.document.getBlock(block().children[row])!.children[column])!;

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
  const button = (format: string) =>
    menu()!.querySelector<HTMLElement>(`[data-inkbrick-part="button"][data-format="${format}"]`);
  const openMenu = (target: HTMLElement) =>
    act(() => void fireEvent.contextMenu(target, { clientX: 40, clientY: 20 }));
  const marks = (row: number, column: number) =>
    cellBlock(row, column).content.map((node) => node.attributes ?? {});

  return { editor, root, tableId, td, block, cellBlock, drag, menu, button, openMenu, marks };
}

describe('formatting selected cells from the right-click menu', () => {
  it('shows the formatting buttons without link and formula, with clear formatting', () => {
    const t = mount();

    t.drag([0, 0], [1, 1]);
    t.openMenu(t.td(0, 0));

    expect(t.menu()!.querySelector('[data-inkbrick-part="button"]')).not.toBeNull();

    for (const format of [
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'color',
      'highlight',
      'align-left',
      'align-center',
      'align-right',
      'clear',
    ])
      expect(t.button(format), format).not.toBeNull();

    expect(t.button('link')).toBeNull();
    expect(t.button('formula')).toBeNull();
  });

  it('applies bold and then removes it from every cell of the range in one step each', () => {
    const t = mount();

    t.drag([0, 0], [1, 1]);
    t.openMenu(t.td(0, 0));
    act(() => void fireEvent.click(t.button('bold')!));

    expect([t.marks(0, 0), t.marks(0, 1), t.marks(1, 0), t.marks(1, 1)]).toEqual([
      [{ bold: true }],
      [{ bold: true }],
      [{ bold: true }],
      [{ bold: true }],
    ]);
    expect(t.marks(0, 2)).toEqual([{}]);
    expect(t.marks(2, 0)).toEqual([{}]);

    // Toolbar остаётся в меню и показывает, что формат включён.
    expect(t.button('bold')!.getAttribute('aria-pressed')).toBe('true');

    act(() => void fireEvent.click(t.button('bold')!));
    expect(t.marks(1, 1)).toEqual([{}]);

    act(() => void t.editor.undo());
    expect(t.marks(0, 0)).toEqual([{ bold: true }]);
    expect(t.marks(1, 1)).toEqual([{ bold: true }]);
  });

  it('centres all the selected cells at once and undoes them together', () => {
    const t = mount();

    t.drag([0, 0], [2, 1]);
    t.openMenu(t.td(1, 1));
    act(() => void fireEvent.click(t.button('align-center')!));

    for (const [row, column] of [
      [0, 0],
      [1, 1],
      [2, 0],
    ])
      expect(t.td(row, column).getAttribute('data-align')).toBe('center');

    expect(t.td(0, 2).getAttribute('data-align')).toBe('left');

    act(() => void t.editor.undo());
    expect(t.td(0, 0).getAttribute('data-align')).toBe('left');
    expect(t.td(2, 1).getAttribute('data-align')).toBe('left');
  });

  it('sets the text colour from the colour panel and clears formatting', () => {
    const t = mount();

    t.drag([0, 0], [0, 2]);
    t.openMenu(t.td(0, 0));
    act(() => void fireEvent.click(t.button('color')!));

    const panel = t.menu()!.querySelector('[data-inkbrick-part="panel"]')!;

    expect(panel).not.toBeNull();

    act(() => void fireEvent.click(panel.querySelector('[data-color="red"]')!));
    expect(t.marks(0, 1)).toEqual([{ color: 'red' }]);
    expect(t.marks(1, 1)).toEqual([{}]);

    act(() => void fireEvent.click(t.button('bold')!));
    act(() => void fireEvent.click(t.button('clear')!));
    expect(t.marks(0, 0)).toEqual([{}]);
    expect(t.marks(0, 2)).toEqual([{}]);
  });

  it('keeps the cell selection after a formatting action', () => {
    const t = mount();

    t.drag([0, 0], [1, 1]);
    t.openMenu(t.td(0, 0));
    act(() => void fireEvent.click(t.button('italic')!));

    expect(t.td(0, 0).hasAttribute('data-cell-selected')).toBe(true);
    expect(t.td(1, 1).hasAttribute('data-cell-selected')).toBe(true);
  });
});

describe('keyboard shortcuts with selected cells', () => {
  const press = (init: KeyboardEventInit) =>
    act(
      () =>
        void document.body.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
        ),
    );

  it('Ctrl+B, Ctrl+I and Ctrl+U toggle the format of all the selected cells', () => {
    const t = mount();

    t.drag([0, 0], [1, 1]);
    press({ key: 'b', ctrlKey: true });
    press({ key: 'i', ctrlKey: true });
    press({ key: 'u', ctrlKey: true });

    expect(t.marks(0, 0)).toEqual([{ bold: true, italic: true, underline: true }]);
    expect(t.marks(1, 1)).toEqual([{ bold: true, italic: true, underline: true }]);
    expect(t.marks(2, 2)).toEqual([{}]);

    press({ key: 'b', ctrlKey: true });
    expect(t.marks(1, 0)).toEqual([{ italic: true, underline: true }]);
  });

  it('Ctrl+Shift+E centres the selected cells and Ctrl+Shift+X strikes them through', () => {
    const t = mount();

    t.drag([1, 0], [1, 2]);
    press({ key: 'E', ctrlKey: true, shiftKey: true });
    press({ key: 'X', ctrlKey: true, shiftKey: true });

    expect(t.td(1, 1).getAttribute('data-align')).toBe('center');
    expect(t.marks(1, 2)).toEqual([{ strike: true }]);
    expect(t.td(0, 1).getAttribute('data-align')).toBe('left');
  });

  it('typing in a menu or palette field does not drop the cell selection', () => {
    const t = mount();

    t.drag([0, 0], [1, 1]);

    const field = document.createElement('input');

    field.setAttribute('data-inkbrick-ui', 'palette');
    document.body.append(field);
    act(() => void fireEvent.keyDown(field, { key: 'a' }));

    expect(t.td(0, 0).hasAttribute('data-cell-selected')).toBe(true);
  });
});

describe('table menu', () => {
  it('has a table grip whose menu toggles header column, stripes and borders', async () => {
    const t = mount();
    const grip = await showGrip(t);

    expect(grip.getAttribute('aria-haspopup')).toBe('menu');

    const item = (id: string) =>
      document.querySelector<HTMLElement>(`[data-testid="block-menu"] [data-action="${id}"]`);

    act(() => void fireEvent.click(grip));
    expect(item('table-headerColumn')).not.toBeNull();

    act(() => void fireEvent.click(item('table-headerColumn')!));
    expect(t.block().props.headerColumn).toBe(true);
    expect(
      t.root.querySelector('[data-inkbrick-block="table"]')!.hasAttribute('data-header-column'),
    ).toBe(true);

    await clickGrip(t);
    act(() => void fireEvent.click(item('table-striped')!));
    expect(t.block().props.striped).toBe(true);
    expect(
      t.root.querySelector('[data-inkbrick-block="table"]')!.hasAttribute('data-striped'),
    ).toBe(true);

    await clickGrip(t);
    act(() => void fireEvent.click(item('table-borders')!));
    expect(t.block().props.borders).toBe(false);
    expect(
      t.root.querySelector('[data-inkbrick-block="table"]')!.getAttribute('data-borders'),
    ).toBe('none');

    act(() => void t.editor.undo());
    expect(t.block().props.borders).not.toBe(false);
  });

  it('paints the selected cells with a background, or the whole table when none are selected', async () => {
    const t = mount();

    t.drag([0, 0], [0, 1]);
    await clickGrip(t);
    act(
      () =>
        void fireEvent.click(
          document.querySelector('[data-testid="block-menu"] [data-action="background-yellow"]')!,
        ),
    );

    expect(t.td(0, 0).getAttribute('data-background')).toBe('yellow');
    expect(t.td(0, 1).getAttribute('data-background')).toBe('yellow');
    expect(t.td(0, 2).hasAttribute('data-background')).toBe(false);
    expect(t.td(1, 0).hasAttribute('data-background')).toBe(false);

    act(() => void t.editor.undo());
    expect(t.td(0, 0).hasAttribute('data-background')).toBe(false);
  });

  it('resets column widths from the menu', async () => {
    const t = mount();

    t.editor.dispatch({
      type: 'setTableColumnWidth',
      payload: { blockId: t.tableId, index: 0, width: 150 },
    } as never);
    expect(t.block().props.widths).toBeDefined();

    await clickGrip(t);
    act(
      () =>
        void fireEvent.click(
          document.querySelector('[data-testid="block-menu"] [data-action="table-reset-widths"]')!,
        ),
    );

    expect(t.block().props.widths).toBeUndefined();
  });
});

async function clickGrip(t: ReturnType<typeof mount>) {
  const grip = await showGrip(t);

  act(() => void fireEvent.click(grip));
}

/** Ручка таблицы: она рисуется, когда в таблице стоит каретка. */
async function showGrip(t: ReturnType<typeof mount>): Promise<HTMLElement> {
  const id = t.cellBlock(1, 1).id;
  const text = t.root.querySelector<HTMLElement>(`.editable[data-id="${id}"]`)!;
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode() ?? text;

  act(() => {
    globalThis.getSelection()!.setBaseAndExtent(node, 0, node, 0);
    document.dispatchEvent(new Event('selectionchange'));
  });

  return await vi.waitFor(() => {
    const grip = document.querySelector<HTMLElement>('[data-inkbrick-part="table-grip"]');

    if (!grip) throw new Error('no table grip');

    return grip;
  });
}

const ALL = { top: 0, left: 0, bottom: 2, right: 2 };

function setup() {
  const editor = createTableEditor({
    rows: [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ],
  });

  return { editor, tableId: tableIdOf(editor)! };
}

describe('tableRangeFormats', () => {
  it('reports what is common to the cells of the range', () => {
    const { editor, tableId } = setup();

    expect(tableRangeFormats(editor, tableId, ALL)).toEqual({
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      code: false,
      align: 'left',
    });

    editor.dispatch({
      type: 'alignTableCells',
      payload: { blockId: tableId, range: ALL, align: 'center' },
    } as never);
    editor.dispatch({
      type: 'formatTableCells',
      payload: { blockId: tableId, range: ALL, format: 'bold' },
    } as never);
    editor.dispatch({
      type: 'setTableCellsColor',
      payload: { blockId: tableId, range: ALL, attributes: { color: 'blue' } },
    } as never);

    expect(tableRangeFormats(editor, tableId, ALL)).toMatchObject({
      bold: true,
      color: 'blue',
      align: 'center',
    });
  });

  it('drops a value that differs between cells', () => {
    const { editor, tableId } = setup();

    editor.dispatch({
      type: 'alignTableCells',
      payload: {
        blockId: tableId,
        range: { top: 0, left: 0, bottom: 0, right: 0 },
        align: 'right',
      },
    } as never);

    expect(tableRangeFormats(editor, tableId, ALL).align).toBeUndefined();
  });
});
