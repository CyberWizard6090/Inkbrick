import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import { createTableEditor, tableIdOf } from '@inkbrick/engine';

import { TableEditor } from '../src';
import { preloadContextMenu } from '../src/context-menu/ContextMenuHost';
import { hideKeyboard } from '../src/hooks/useSheet';
import { CustomColorButton } from '../src/ui/CustomColorSwatch';
import './harness';
import { pickCustomColor } from './pickCustomColor';

beforeAll(async () => {
  await preloadContextMenu();
});

/** Телефон: палец и узкое окно (`useSheet`), или мышь (`null`). */
function pointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as never;
}

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
  Reflect.deleteProperty(window, 'matchMedia');
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
  const cellBlock = (row: number, column: number) =>
    editor.document.getBlock(
      editor.document.getBlock(editor.document.getBlock(tableId)!.children[row])!.children[column],
    )!;
  const td = (row: number, column: number) =>
    root.querySelectorAll('tr')[row].querySelectorAll('td')[column] as HTMLTableCellElement;
  const menu = () => document.querySelector<HTMLElement>('[data-testid="context-menu"]');
  const item = (action: string) => document.querySelector<HTMLElement>(`[data-action="${action}"]`);
  const flyout = (id: string) => document.querySelector<HTMLElement>(`[data-flyout="${id}"]`);

  /** Каретка в ячейке (1, 1) и контекстное меню на ней. */
  const openMenu = () => {
    const id = cellBlock(1, 1).id;
    const text = root.querySelector<HTMLElement>(`.editable[data-id="${id}"]`)!;
    const node = document.createTreeWalker(text, NodeFilter.SHOW_TEXT).nextNode() ?? text;

    act(() => {
      globalThis.getSelection()!.setBaseAndExtent(node, 0, node, 0);
      document.dispatchEvent(new Event('selectionchange'));
    });
    act(() => void fireEvent.contextMenu(td(1, 1), { clientX: 40, clientY: 20 }));
  };
  const open = (action: string) => act(() => void fireEvent.click(item(action)!));

  return { editor, root, cellBlock, td, menu, item, flyout, openMenu, open };
}

describe('cell menu: background, borders and style', () => {
  it('a background dot paints the cell under the menu with the saturated palette colour', () => {
    pointer(false);
    const t = mount();

    t.openMenu();
    t.open('table-cell-background');

    const dot = t
      .flyout('table-cell-background')!
      .querySelector<HTMLElement>('[data-action="color-green"]')!;

    // Образец показывает тот же насыщенный цвет, что ляжет на ячейку.
    expect(dot.style.getPropertyValue('--inkbrick-swatch')).toBe('var(--inkbrick-cell-green)');

    act(() => void fireEvent.click(dot));
    expect(t.cellBlock(1, 1).props.background).toBe('green');
    expect(t.cellBlock(0, 0).props.background).toBeUndefined();

    t.openMenu();
    t.open('table-cell-background');
    act(() => void fireEvent.click(t.item('color-remove')!));
    expect(t.cellBlock(1, 1).props.background).toBeUndefined();
  });

  it('a custom colour from the picker paints the cell, and its text gets a contrasting colour', async () => {
    pointer(false);
    const t = mount();

    t.openMenu();
    t.open('table-cell-background');

    await pickCustomColor(t.flyout('table-cell-background')!, '1e3a8a');

    expect(t.cellBlock(1, 1).props.background).toBe('#1e3a8a');
    expect(t.td(1, 1).style.getPropertyValue('--inkbrick-cell-text')).toBe(
      'var(--inkbrick-cell-text-light)',
    );

    // Полупрозрачный фон почти не меняет страницу под собой: текст остаётся цветом темы.
    t.openMenu();
    t.open('table-cell-background');
    await pickCustomColor(t.flyout('table-cell-background')!, '1e3a8a40');
    expect(t.cellBlock(1, 1).props.background).toBe('#1e3a8a40');
    expect(t.td(1, 1).getAttribute('data-background')).toBe('custom-alpha');
    expect(t.td(1, 1).style.getPropertyValue('--inkbrick-cell-text')).toBe('');
  });

  it('a custom border colour with transparency from the picker goes on the lines and is drawn as chosen', async () => {
    pointer(false);
    const t = mount();

    t.openMenu();
    t.open('table-cell-borders');
    t.open('table-border-colorMenu');
    await pickCustomColor(t.flyout('table-border-colorMenu')!, 'ff000080');

    expect(t.cellBlock(1, 1).props.borderRightColor).toBe('#ff000080');
    expect(t.td(1, 1).style.borderRightColor).toBe('rgba(255, 0, 0, 0.5)');
    // Схема и движок принимают только имя палитры или #rrggbb[aa].
    expect(
      t.editor.can('setTableCellsBorders', {
        blockId: tableIdOf(t.editor)!,
        range: { top: 1, left: 1, bottom: 1, right: 1 },
        mode: 'keep',
        color: 'url(x)',
      } as never),
    ).toBe(false);
  });

  it('line width, style and colour change the existing lines; placements draw new ones', () => {
    pointer(false);
    const t = mount();

    t.openMenu();
    t.open('table-cell-borders');
    t.open('table-border-widthMenu');
    act(() => void fireEvent.click(t.item('table-border-width-thick')!));
    expect(t.cellBlock(1, 1).props.borderTop).toBe('thick');
    // Общая линия записана и в соседа, только эта его сторона.
    expect(t.cellBlock(0, 1).props.borderBottom).toBe('thick');
    expect(t.cellBlock(0, 1).props.borderTop).toBeUndefined();

    t.openMenu();
    t.open('table-cell-borders');
    t.open('table-border-styleMenu');
    act(() => void fireEvent.click(t.item('table-border-style-dashed')!));
    expect(t.cellBlock(1, 1).props.borderLeftStyle).toBe('dashed');

    t.openMenu();
    t.open('table-cell-borders');
    t.open('table-border-colorMenu');

    const red = t
      .flyout('table-border-colorMenu')!
      .querySelector<HTMLElement>('[data-action="color-red"]')!;

    // Образец цвета границы — цвет самой линии.
    expect(red.style.getPropertyValue('--inkbrick-swatch')).toBe('var(--inkbrick-color-red)');
    act(() => void fireEvent.click(red));
    expect(t.cellBlock(1, 1).props.borderRightColor).toBe('red');
    expect(t.cellBlock(1, 2).props.borderLeftColor).toBe('red');
    expect(t.cellBlock(1, 2).props.borderRightColor).toBeUndefined();

    t.openMenu();
    t.open('table-cell-borders');
    act(() => void fireEvent.click(t.item('table-border-none')!));
    expect(t.cellBlock(1, 1).props.borderTop).toBe('none');
    expect(t.cellBlock(1, 1).props.borderTopColor).toBeUndefined();
  });

  it('a style from the gallery applies to the table', () => {
    pointer(false);
    const t = mount();

    t.openMenu();
    t.open('table-style');
    act(() => void fireEvent.click(t.item('table-style-green')!));

    expect(t.editor.document.getBlock(tableIdOf(t.editor)!)!.props.tableStyle).toBe('green');
  });
});

describe('style gallery and nested panels from the keyboard', () => {
  it('pointing at or focusing a style previews it on the table; leaving restores it', () => {
    pointer(false);
    const t = mount();
    const table = () => t.root.querySelector<HTMLElement>('[data-inkbrick-block="table"]')!;

    t.openMenu();
    t.open('table-style');

    const blue = t.item('table-style-blue')!;

    act(() => void fireEvent.pointerEnter(blue));
    expect(table().getAttribute('data-table-style')).toBe('blue');
    act(() => void fireEvent.pointerLeave(blue.parentElement!));
    expect(table().getAttribute('data-table-style')).not.toBe('blue');

    act(() => void fireEvent.focus(blue));
    expect(table().getAttribute('data-table-style')).toBe('blue');
    act(() => void fireEvent.blur(blue));
    expect(table().getAttribute('data-table-style')).not.toBe('blue');
    // Предпросмотр не пишет в документ.
    expect(t.editor.document.getBlock(tableIdOf(t.editor)!)!.props.tableStyle).toBeUndefined();
  });

  it('ArrowRight opens a nested panel, ArrowLeft goes back to its item', () => {
    pointer(false);
    const t = mount();

    t.openMenu();

    const row = t.item('table-cell-borders')!;

    act(() => void fireEvent.keyDown(row, { key: 'ArrowRight' }));

    const panel = t.flyout('table-cell-borders')!;

    expect(panel).not.toBeNull();
    act(() => void fireEvent.keyDown(panel, { key: 'ArrowLeft' }));
    expect(t.flyout('table-cell-borders')?.closest('[data-state="open"]') ?? null).toBeNull();
    expect(t.menu()).not.toBeNull();
  });
});

describe('menus as bottom sheets on a phone', () => {
  it('the cell menu is a sheet with a backdrop; a nested panel stacks with Back; the backdrop only closes', () => {
    pointer(true);
    const t = mount();

    t.openMenu();
    expect(t.menu()!.hasAttribute('data-sheet')).toBe(true);
    expect(document.querySelector('[data-inkbrick-part="sheet-backdrop"]')).not.toBeNull();

    t.open('table-cell-borders');

    const panel = t.flyout('table-cell-borders')!;

    expect(panel.hasAttribute('data-sheet')).toBe(true);
    expect(
      document.querySelector('[data-inkbrick-part="sheet-backdrop"][data-nested]'),
    ).not.toBeNull();

    // «Назад» закрывает только вложенный лист.
    act(() => void fireEvent.click(panel.querySelector('[data-inkbrick-part="sheet-back"]')!));
    expect(t.flyout('table-cell-borders')?.closest('[data-state="open"]') ?? null).toBeNull();
    expect(t.menu()).not.toBeNull();

    // Затемнение закрывает меню и не переносит фокус в документ.
    const backdrop = document.querySelector<HTMLElement>(
      '[data-inkbrick-part="sheet-backdrop"]:not([data-nested])',
    )!;

    // Касание, начатое на затемнении (click без своего нажатия — хвост касания, открывшего меню, — не закрывает).
    act(() => void fireEvent.click(backdrop));
    expect(t.menu()?.closest('[data-state="open"]') ?? null).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(backdrop);
      fireEvent.click(backdrop);
    });
    expect(t.menu()?.closest('[data-state="open"]') ?? null).toBeNull();
  });

  it('opening a sheet takes the focus out of the text, so the on-screen keyboard hides', () => {
    // Поле документа (в jsdom нет isContentEditable, поэтому — обычное поле ввода вне интерфейса редактора).
    const editable = document.createElement('input');

    document.body.append(editable);
    editable.focus();
    expect(document.activeElement).toBe(editable);

    hideKeyboard();
    expect(document.activeElement).not.toBe(editable);

    // Поле внутри интерфейса редактора (например, поиск в меню) фокус сохраняет.
    const ui = document.createElement('div');
    const input = document.createElement('input');

    ui.dataset.inkbrickUi = 'context-menu';
    ui.append(input);
    document.body.append(ui);
    input.focus();
    hideKeyboard();
    expect(document.activeElement).toBe(input);

    editable.remove();
    ui.remove();
  });
});

describe('custom colour swatch', () => {
  it('opens the colour picker under itself, applies #rrggbb / #rrggbbaa, and Escape and Cancel close it', async () => {
    const onPick = vi.fn();
    const view = render(
      <div data-inkbrick-part="swatches">
        <CustomColorButton
          value={undefined}
          fallback="#ffe74a"
          label="Custom colour"
          pressed={false}
          onPick={onPick}
        />
      </div>,
    );
    const swatch = view.container.querySelector<HTMLElement>('[data-color="custom"]')!;
    const part = (name: string) =>
      view.container.querySelector<HTMLElement>(`[data-inkbrick-part="${name}"]`);

    expect(swatch.getAttribute('aria-expanded')).toBe('false');
    await pickCustomColor(view.container, '3366FF');
    expect(onPick).toHaveBeenLastCalledWith('#3366ff');
    expect(part('color-picker-panel')).toBeNull();

    await pickCustomColor(view.container, '#3366ff80');
    expect(onPick).toHaveBeenLastCalledWith('#3366ff80');

    // Выбор начинается с запасного цвета; Escape закрывает его, ничего не выбирая, и фокус возвращается на образец.
    act(() => void fireEvent.click(swatch));
    await waitFor(() => expect(part('color-field')).not.toBeNull());
    expect((part('color-field') as HTMLInputElement).value).toBe('FFE74A');
    act(() => void fireEvent.keyDown(part('color-area')!, { key: 'Escape' }));
    expect(part('color-picker-panel')).toBeNull();
    expect(document.activeElement).toBe(swatch);
    expect(onPick).toHaveBeenCalledTimes(2);
  });

  it('alphaHex="always" gives eight digits even for an opaque colour', async () => {
    const onPick = vi.fn();
    const view = render(
      <CustomColorButton
        value="#12ab34"
        fallback="#ffe74a"
        label="Custom colour"
        pressed
        alphaHex="always"
        onPick={onPick}
      />,
    );

    await pickCustomColor(view.container, '12ab34');
    expect(onPick).toHaveBeenCalledWith('#12ab34ff');
  });
});

describe('row and column menus', () => {
  /** Каретка в ячейке (1, 1) и меню плашки строки или столбца. */
  function grip(t: ReturnType<typeof mount>, part: 'row-grip' | 'column-grip', action: string) {
    const id = t.cellBlock(1, 1).id;
    const text = t.root.querySelector<HTMLElement>(`.editable[data-id="${id}"]`)!;
    const node = document.createTreeWalker(text, NodeFilter.SHOW_TEXT).nextNode() ?? text;

    act(() => {
      globalThis.getSelection()!.setBaseAndExtent(node, 0, node, 0);
      document.dispatchEvent(new Event('selectionchange'));
    });

    const button = document.querySelector<HTMLElement>(`[data-inkbrick-part="${part}"]`)!;

    act(() => void fireEvent.click(button));

    const entry = document.querySelector<HTMLElement>(
      `[data-testid="block-menu"] [data-action="${action}"]`,
    );

    expect(entry, action).not.toBeNull();
    act(() => void fireEvent.click(entry!));
  }

  const text = (t: ReturnType<typeof mount>) =>
    t.editor.document.getBlock(tableIdOf(t.editor)!)!.children.map((rowId) =>
      t.editor.document.getBlock(rowId)!.children.map((id) =>
        t.editor.document
          .getBlock(id)!
          .content.map((n) => n.insert)
          .join(''),
      ),
    );

  it('row actions: insert, move, select, delete', () => {
    pointer(false);
    const t = mount();

    grip(t, 'row-grip', 'row-insert-above');
    expect(text(t)).toHaveLength(4);
    grip(t, 'row-grip', 'row-delete');
    expect(text(t)).toHaveLength(3);
    grip(t, 'row-grip', 'row-insert-below');
    expect(text(t)).toHaveLength(4);
    grip(t, 'row-grip', 'row-delete');

    for (const action of ['row-move-down', 'row-move-up']) {
      const before = JSON.stringify(text(t));

      grip(t, 'row-grip', action);
      expect(JSON.stringify(text(t)), action).not.toBe(before);
      act(() => void t.editor.undo());
      expect(JSON.stringify(text(t))).toBe(before);
    }

    grip(t, 'row-grip', 'row-select');
    expect(t.root.querySelectorAll('td[data-cell-selected]')).toHaveLength(3);
  });

  it('column actions: insert, move, align, type, sort, select, delete', () => {
    pointer(false);
    const t = mount();

    grip(t, 'column-grip', 'column-select');
    expect(t.root.querySelectorAll('td[data-cell-selected]').length).toBeGreaterThanOrEqual(3);
    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));

    grip(t, 'column-grip', 'column-insert-left');
    expect(text(t)[0]).toHaveLength(4);
    grip(t, 'column-grip', 'column-delete');
    grip(t, 'column-grip', 'column-insert-right');
    expect(text(t)[0]).toHaveLength(4);
    grip(t, 'column-grip', 'column-delete');
    expect(text(t)[0]).toHaveLength(3);

    for (const action of ['column-move-right', 'column-move-left']) {
      const before = JSON.stringify(text(t));

      grip(t, 'column-grip', action);
      expect(JSON.stringify(text(t)), action).not.toBe(before);
      act(() => void t.editor.undo());
      expect(JSON.stringify(text(t))).toBe(before);
    }

    for (const align of ['center', 'right', 'left'])
      grip(t, 'column-grip', `column-align-${align}`);
    grip(t, 'column-grip', 'column-type-number');
    grip(t, 'column-grip', 'column-type-text');
    grip(t, 'column-grip', 'column-sort-desc');
  });

  it('on a phone the column menu has the width bar', () => {
    pointer(true);
    const t = mount();

    grip(t, 'column-grip', 'column-width-slider');

    const bar = document.querySelector<HTMLElement>('[data-inkbrick-ui="column-width-bar"]')!;

    // Ширины раскладки jsdom не считает: проверяется, что полоса открыта и её кнопки работают без ошибок.
    expect(bar).not.toBeNull();
    act(() => void fireEvent.click(bar.querySelector('[data-action="column-width-wider"]')!));
    act(() => void fireEvent.click(bar.querySelector('[data-action="column-width-narrower"]')!));
    expect(document.querySelector('[data-inkbrick-ui="column-width-bar"]')).not.toBeNull();
  });
});

describe('sheet geometry and closing', () => {
  it('a sheet stands above the on-screen keyboard and follows a change of the pointer', () => {
    const listeners: Record<string, () => void> = {};
    let media: (() => void) | undefined;
    let coarse = true;

    window.matchMedia = ((query: string) => ({
      get matches() {
        return coarse;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => void (media = listener),
      removeEventListener: () => undefined,
    })) as never;
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: window.innerHeight - 300,
        offsetTop: 0,
        addEventListener: (type: string, listener: () => void) => void (listeners[type] = listener),
        removeEventListener: () => undefined,
      },
    });

    const t = mount();

    t.openMenu();
    expect(t.menu()!.style.bottom).toBe('300px');

    // Клавиатура спряталась: лист опускается к низу окна.
    (window.visualViewport as unknown as { height: number }).height = window.innerHeight;
    act(() => listeners.resize?.());
    expect(t.menu()!.style.bottom).toBe('0px');

    // Окно стало широким (или мышь): меню — снова окошко.
    coarse = false;
    act(() => media?.());
    expect(t.menu()?.hasAttribute('data-sheet')).toBe(false);

    Reflect.deleteProperty(window, 'visualViewport');
  });

  it('the context menu closes when the window loses the focus, scrolls or is resized', () => {
    pointer(false);
    const t = mount();
    const closed = () => !t.menu() || !!t.menu()!.closest('[data-state="closed"]');

    for (const event of ['blur', 'resize']) {
      t.openMenu();
      expect(closed()).toBe(false);
      act(() => void window.dispatchEvent(new Event(event)));
      expect(closed(), event).toBe(true);
    }

    t.openMenu();
    act(() => void document.dispatchEvent(new Event('scroll')));
    expect(closed()).toBe(true);
  });

  it('on a phone the column menu is a sheet; its backdrop closes it', () => {
    pointer(true);
    const t = mount();
    const id = t.cellBlock(1, 1).id;
    const text = t.root.querySelector<HTMLElement>(`.editable[data-id="${id}"]`)!;
    const node = document.createTreeWalker(text, NodeFilter.SHOW_TEXT).nextNode() ?? text;

    act(() => {
      globalThis.getSelection()!.setBaseAndExtent(node, 0, node, 0);
      document.dispatchEvent(new Event('selectionchange'));
    });
    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-part="column-grip"]')!));

    const sheet = document.querySelector<HTMLElement>('[data-testid="block-menu"]')!;

    expect(sheet.hasAttribute('data-sheet')).toBe(true);
    act(() => {
      const backdrop = document.querySelector('[data-inkbrick-part="sheet-backdrop"]')!;

      fireEvent.pointerDown(backdrop);
      fireEvent.click(backdrop);
    });
    expect(
      document.querySelector('[data-testid="block-menu"]')?.closest('[data-state="open"]') ?? null,
    ).toBeNull();
  });
});
