import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import type { ContextMenuProps } from '../src';
import {
  canReadClipboard,
  copySelection,
  pasteFromClipboard,
  shortcutLabel,
} from '../src/context-menu/clipboardActions';
import { preloadContextMenu } from '../src/context-menu/ContextMenuHost';
import { mountEditor } from './harness';

// Содержимое меню — отдельный чанк; в приложении он грузится заранее, здесь — до тестов.
beforeAll(async () => {
  await preloadContextMenu();
});

const $menu = () => document.querySelector<HTMLElement>('[data-testid="context-menu"]');
const item = (id: string) =>
  $menu()!.querySelector<HTMLElement>(`[data-inkbrick-part="item"][data-action="${id}"]`)!;

function stubClipboard(clipboard: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

let execCommand: ReturnType<typeof vi.fn>;
const originalRect = Range.prototype.getBoundingClientRect;

beforeEach(() => {
  // jsdom не считает раскладку: у выделения должен быть прямоугольник, иначе кнопки форматирования не появятся.
  Range.prototype.getBoundingClientRect = () => new DOMRect(100, 100, 60, 18);
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
});

afterEach(() => {
  Range.prototype.getBoundingClientRect = originalRect;
  cleanup();
  stubClipboard(undefined);
  vi.restoreAllMocks();
});

describe('clipboard actions', () => {
  it('labels shortcuts for the platform', () => {
    const platform = vi.spyOn(navigator, 'platform', 'get');

    platform.mockReturnValue('MacIntel');
    expect(shortcutLabel('C')).toBe('⌘C');

    platform.mockReturnValue('Win32');
    expect(shortcutLabel('C')).toBe('Ctrl+C');
  });

  it('copies and cuts through the browser command and survives its failure', () => {
    expect(copySelection(false)).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');

    copySelection(true);
    expect(execCommand).toHaveBeenLastCalledWith('cut');

    execCommand.mockImplementation(() => {
      throw new Error('denied');
    });
    expect(copySelection(false)).toBe(false);
  });

  it('knows whether the clipboard can be read', () => {
    stubClipboard(undefined);
    expect(canReadClipboard()).toBe(false);

    stubClipboard({ readText: async () => '' });
    expect(canReadClipboard()).toBe(true);
  });

  it('pastes text, HTML and images read through the Clipboard API', async () => {
    const root = document.createElement('div');
    const received: { text: string; html: string; files: File[] }[] = [];

    root.addEventListener('paste', (event) => {
      const data = (event as ClipboardEvent).clipboardData!;

      received.push({
        text: data.getData('text/plain'),
        html: data.getData('text/html'),
        files: [...data.files],
      });
    });

    const blob = (value: string, type: string) => ({ text: async () => value, type }) as Blob;

    stubClipboard({
      read: async () =>
        [
          {
            types: ['text/plain', 'text/html', 'image/png', 'application/octet-stream'],
            getType: async (type: string) =>
              type === 'image/png' ? new Blob(['png'], { type }) : blob(`[${type}]`, type),
          },
        ] as unknown as ClipboardItems,
    });

    expect(await pasteFromClipboard(root)).toBe(true);
    expect(received[0].text).toBe('[text/plain]');
    expect(received[0].html).toBe('[text/html]');
    expect(received[0].files.map((file) => file.type)).toEqual(['image/png']);

    stubClipboard({ readText: async () => 'plain only' });
    await pasteFromClipboard(root);
    expect(received[1].text).toBe('plain only');

    stubClipboard({
      readText: async () => {
        throw new Error('denied');
      },
    });
    expect(await pasteFromClipboard(root)).toBe(false);
    expect(received).toHaveLength(2);
  });
});

describe('context menu items', () => {
  it('copy and cut run the editor clipboard and close the menu', () => {
    const { ids, select, editable } = mountEditor(['copy me']);

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 4 });
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });
    fireEvent.click(item('copy'));

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect($menu()).toBeNull();

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 4 });
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });
    fireEvent.click(item('cut'));
    expect(execCommand).toHaveBeenLastCalledWith('cut');
  });

  it('paste inserts the clipboard text at the caret', async () => {
    stubClipboard({ readText: async () => 'XY' });

    const { editor, ids, caret, editable, root } = mountEditor(['ab']);

    root.focus();
    caret(ids[0], 1);
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });
    expect(item('paste').hasAttribute('data-disabled')).toBe(false);

    await act(async () => {
      fireEvent.click(item('paste'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(editor.engine.inline.toPlainText(editor.document.getBlock(ids[0])!.content)).toBe(
      'aXYb',
    );
  });

  it('paste is disabled without the Clipboard API; Select all selects the document', () => {
    const { ids, caret, editable } = mountEditor(['one', 'two']);

    caret(ids[0], 1);
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });
    expect(item('paste').hasAttribute('data-disabled')).toBe(true);

    fireEvent.click(item('selectAll'));
    expect(getSelection()!.toString()).toContain('one');
    expect(getSelection()!.toString()).toContain('two');
  });

  it('is operable from the keyboard', () => {
    stubClipboard({ readText: async () => '' });

    const { ids, caret, editable } = mountEditor(['text']);

    caret(ids[0], 1);
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });

    // Без выделения фокус на первом доступном пункте: «Вставить» (вырезать и копировать отключены).
    fireEvent.keyDown($menu()!, { key: 'ArrowDown' });
    fireEvent.keyDown($menu()!, { key: 'ArrowUp' });
    expect(document.activeElement?.getAttribute('data-action')).toBe('paste');

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-action')).toBe('selectAll');

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect($menu()).toBeNull();
  });

  it('a disabled item does nothing', () => {
    const { ids, caret, editable } = mountEditor(['text']);

    caret(ids[0], 1);
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });
    fireEvent.click(item('copy'));

    expect(execCommand).not.toHaveBeenCalled();
    expect($menu()).not.toBeNull();
  });
});

describe('context menu opening and closing', () => {
  it('opens at the selection when invoked from the keyboard', () => {
    const { ids, caret, editable } = mountEditor(['text']);

    caret(ids[0], 1);
    fireEvent.contextMenu(editable(ids[0]), { clientX: 0, clientY: 0 });

    expect($menu()).not.toBeNull();
  });

  it('keeps the browser menu on links, touch and when the slot is null', () => {
    const { ids, editable, root } = mountEditor(['text']);
    const link = document.createElement('a');

    link.href = 'https://example.com';
    editable(ids[0]).append(link);

    expect(fireEvent.contextMenu(link)).toBe(true);

    const touch = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    root.dispatchEvent(touch);
    expect(touch.defaultPrevented).toBe(false);
    expect($menu()).toBeNull();

    cleanup();

    const other = mountEditor(['text'], { slots: { ContextMenu: null } });

    expect(fireEvent.contextMenu(other.editable(other.ids[0]))).toBe(true);
  });

  it('closes on scroll, resize, blur and Escape from the document', () => {
    const { ids, editable, root } = mountEditor(['text']);
    const open = () => fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });

    open();
    fireEvent.scroll(window);
    expect($menu()).toBeNull();

    open();
    fireEvent(window, new Event('resize'));
    expect($menu()).toBeNull();

    open();
    fireEvent(window, new Event('blur'));
    expect($menu()).toBeNull();

    open();
    fireEvent.keyDown(root, { key: 'Escape' });
    expect($menu()).toBeNull();
    expect(document.activeElement).toBe(root);

    // Esc без открытого меню и без каретки в тексте ничего не перехватывает (с кареткой он выбирает блок).
    getSelection()!.removeAllRanges();
    expect(fireEvent.keyDown(root, { key: 'Escape' })).toBe(true);
  });

  it('a pointer press inside the menu does not close it', () => {
    const { ids, editable } = mountEditor(['text']);

    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });
    fireEvent.pointerDown(item('selectAll'));

    expect($menu()).not.toBeNull();
    // Своё меню браузера поверх нашего не открывается.
    expect(fireEvent.contextMenu($menu()!)).toBe(false);
  });

  it('stays inside the window near its right and bottom edges', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(150);

    const { ids, editable } = mountEditor(['text']);

    fireEvent.contextMenu(editable(ids[0]), {
      clientX: window.innerWidth - 20,
      clientY: window.innerHeight - 20,
    });

    const style = $menu()!.style;

    expect(parseFloat(style.left)).toBe(window.innerWidth - 20 - 200);
    expect(parseFloat(style.top)).toBe(window.innerHeight - 20 - 150);
  });

  it('a custom slot gets the formatting buttons and the items', () => {
    const seen: ContextMenuProps[] = [];
    const Custom = (props: ContextMenuProps) => {
      seen.push(props);
      return <div data-testid="custom-menu" />;
    };
    const { ids, select, editable } = mountEditor(['format me'], {
      slots: { ContextMenu: Custom },
    });

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 6 });
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });

    const last = seen[seen.length - 1];

    expect(document.querySelector('[data-testid="custom-menu"]')).not.toBeNull();
    expect(last.formatting).not.toBeNull();
    expect(last.items.map((entry) => entry.id)).toEqual(['cut', 'copy', 'paste', 'selectAll']);

    act(() => last.onClose());
    expect(document.querySelector('[data-testid="custom-menu"]')).toBeNull();
  });

  it('the formula button closes the menu and opens the formula editor', () => {
    const { ids, select, editable } = mountEditor(['x+1']);

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 3 });
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });
    fireEvent.click($menu()!.querySelector('[data-format="formula"]')!);

    expect($menu()).toBeNull();
  });
});

describe('table items', () => {
  async function mountTable() {
    const { tableBlocks } = await import('../src');
    const mounted = mountEditor(['before'], { blocks: tableBlocks });
    const { editor, ids } = mounted;
    const getBlock = (id: string) => editor.document.getBlock(id);
    let caret!: { blockId: string };

    act(() => {
      caret = editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:table', afterId: ids[0] },
      }) as { blockId: string };
    });

    const { locateTableCell, tableCellAt } = await import('@inkbrick/engine');
    const tableId = locateTableCell(getBlock, caret.blockId)!.tableId;
    const rows = () => getBlock(tableId)!.children.length;
    const columns = () => getBlock(getBlock(tableId)!.children[0])!.children.length;

    return {
      ...mounted,
      tableId,
      rows,
      columns,
      cell: (r: number, c: number) => tableCellAt(getBlock, tableId, r, c)!,
    };
  }

  it('are added under the standard ones and edit the row and column under the caret', async () => {
    const { editable, root, caret, rows, columns, cell } = await mountTable();

    root.focus();
    caret(cell(1, 1), 0);
    fireEvent.contextMenu(editable(cell(1, 1)), { clientX: 40, clientY: 20 });

    const ids = [...$menu()!.querySelectorAll('[data-action]')].map((el) =>
      el.getAttribute('data-action'),
    );

    expect(ids).toEqual([
      'cut',
      'copy',
      'paste',
      'selectAll',
      'table-row-above',
      'table-row-below',
      'table-row-delete',
      'table-column-left',
      'table-column-right',
      'table-column-delete',
      'table-header',
      'table-headerColumn',
      'table-striped',
      'table-borders',
      'table-freezeRow',
      'table-freezeColumn',
      'table-reset-widths',
    ]);
    // Один разделитель перед пунктами таблицы и один перед её форматированием.
    expect($menu()!.querySelectorAll('[role="separator"]')).toHaveLength(2);

    fireEvent.click(item('table-row-below'));
    expect([rows(), columns(), $menu()]).toEqual([4, 3, null]);

    fireEvent.contextMenu(editable(cell(1, 1)), { clientX: 40, clientY: 20 });
    fireEvent.click(item('table-column-right'));
    expect([rows(), columns()]).toEqual([4, 4]);

    fireEvent.contextMenu(editable(cell(1, 1)), { clientX: 40, clientY: 20 });
    fireEvent.click(item('table-column-delete'));
    fireEvent.contextMenu(editable(cell(1, 1)), { clientX: 40, clientY: 20 });
    fireEvent.click(item('table-row-delete'));
    expect([rows(), columns()]).toEqual([3, 3]);
  });

  it('are absent outside a table and for the editor without tableBlocks', async () => {
    const { editable, ids, root, caret } = mountEditor(['text']);

    root.focus();
    caret(ids[0], 1);
    fireEvent.contextMenu(editable(ids[0]), { clientX: 40, clientY: 20 });

    expect($menu()!.querySelector('[data-action^="table"]')).toBeNull();
  });
});
