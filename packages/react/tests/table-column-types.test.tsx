import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { locateTableCell, tableCellAt, type CaretResult } from '@inkbrick/engine';

import { tableBlocks } from '../src';
import { columnHref as href, isChecked, parseSelected } from '../src/table/columnTypes';
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
  const props = () => getBlock(tableId)!.props as Record<string, unknown>;
  const td = (row: number, column: number) =>
    document.querySelector<HTMLElement>(`[data-block-id="${cell(row, column)}"]`)!;

  const set = (row: number, column: number, value: string) =>
    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: {
          blockId: cell(row, column),
          from: 0,
          to: text(cell(row, column)).length,
          text: value,
        },
      });
    });
  const configure = (payload: Record<string, unknown>) =>
    act(() => {
      for (const [type, body] of Object.entries(payload)) {
        editor.dispatch({ type, payload: { blockId: tableId, ...(body as object) } } as never);
      }
    });

  return { ...mounted, tableId, cell, text, props, td, set, configure };
}

describe('column value helpers', () => {
  it('reads checked values and comma-separated selections', () => {
    expect(isChecked('true')).toBe(true);
    expect(isChecked(' TRUE ')).toBe(true);
    expect(isChecked('')).toBe(false);
    expect(isChecked('yes')).toBe(false);
    expect(parseSelected('a, b ,a,, c')).toEqual(['a', 'b', 'c']);
    expect(parseSelected('')).toEqual([]);
  });

  it('builds a safe address for links, email and phone and rejects the rest', () => {
    expect(href('url', 'example.com')).toBe('https://example.com');
    expect(href('url', 'javascript:alert(1)')).toBeUndefined();
    expect(href('email', 'a@b.co')).toBe('mailto:a@b.co');
    expect(href('email', 'not an email')).toBeUndefined();
    expect(href('phone', '+7 (900) 123-45-67')).toBe('tel:+79001234567');
    expect(href('phone', '12')).toBeUndefined();
    expect(href('phone', 'call me maybe')).toBeUndefined();
    expect(href('text', 'anything')).toBeUndefined();
    expect(href('url', '')).toBeUndefined();
  });
});

describe('checkbox column', () => {
  it('draws a checkbox in the body cells, not in the header, and a click toggles true and empty', () => {
    const t = mountTable();

    t.configure({ setTableColumnType: { index: 1, type: 'checkbox' } });

    expect(t.td(1, 1).querySelector('[data-inkbrick-part="cell-checkbox"]')).not.toBeNull();
    expect(t.td(0, 1).querySelector('[data-inkbrick-part="cell-checkbox"]')).toBeNull();
    expect(t.td(1, 1).getAttribute('data-column-type')).toBe('checkbox');
    expect(t.td(1, 0).getAttribute('data-column-type')).toBeNull();

    const box = t.td(1, 1).querySelector<HTMLInputElement>('input')!;

    act(() => void fireEvent.click(box));
    expect(t.text(t.cell(1, 1))).toBe('true');
    expect(box.checked).toBe(true);

    act(() => void fireEvent.click(box));
    expect(t.text(t.cell(1, 1))).toBe('');
  });

  it('a row inserted later has the checkbox too', () => {
    const t = mountTable();

    t.configure({
      setTableColumnType: { index: 2, type: 'checkbox' },
      insertTableRow: { index: 3 },
    });

    expect(t.td(3, 2).querySelector('input[type="checkbox"]')).not.toBeNull();
  });
});

describe('select and multi-select columns', () => {
  const options = [
    { label: 'Open', color: 'green' },
    { label: 'Closed', color: 'blue' },
  ];
  const mountSelect = (type: 'select' | 'multiselect') => {
    const t = mountTable();

    t.configure({
      setTableColumnType: { index: 1, type },
      setTableColumnOptions: { index: 1, options },
    });

    return t;
  };
  const chips = (t: ReturnType<typeof mountTable>, row = 1) => [
    ...t.td(row, 1).querySelectorAll<HTMLElement>('[data-inkbrick-part="chip"]'),
  ];
  const picker = () => document.querySelector<HTMLElement>('[data-inkbrick-ui="options-picker"]');
  const choose = (label: string) => {
    const option = [...picker()!.querySelectorAll<HTMLElement>('[role="option"]')].find((node) =>
      node.textContent?.includes(label),
    )!;

    act(() => void fireEvent.click(option));
  };

  it('shows the value as a coloured chip, and an unknown value as a grey one', () => {
    const t = mountSelect('select');

    t.set(1, 1, 'Open');
    t.set(2, 1, 'Other');

    expect(chips(t)[0].textContent).toBe('Open');
    expect(chips(t)[0].getAttribute('data-color')).toBe('green');
    expect(chips(t, 2)[0].getAttribute('data-color')).toBe('gray');
  });

  it('picks one value, replaces it with another and clears it by choosing it again', () => {
    const t = mountSelect('select');
    const open = () =>
      act(
        () => void fireEvent.click(t.td(1, 1).querySelector('[data-inkbrick-part="cell-chips"]')!),
      );

    open();
    choose('Open');
    expect(t.text(t.cell(1, 1))).toBe('Open');
    expect(picker()).toBeNull();

    open();
    choose('Closed');
    expect(t.text(t.cell(1, 1))).toBe('Closed');

    open();
    choose('Closed');
    expect(t.text(t.cell(1, 1))).toBe('');
  });

  it('multi-select keeps the picker open and builds a comma-separated value', () => {
    const t = mountSelect('multiselect');

    act(() => void fireEvent.click(t.td(1, 1).querySelector('[data-inkbrick-part="cell-chips"]')!));
    choose('Open');
    choose('Closed');

    expect(picker()).not.toBeNull();
    expect(t.text(t.cell(1, 1))).toBe('Open, Closed');
    expect(chips(t)).toHaveLength(2);

    choose('Open');
    expect(t.text(t.cell(1, 1))).toBe('Closed');
  });

  it('Escape closes the picker', () => {
    const t = mountSelect('select');

    act(() => void fireEvent.click(t.td(1, 1).querySelector('[data-inkbrick-part="cell-chips"]')!));
    act(() => void fireEvent.keyDown(picker()!, { key: 'Escape' }));
    expect(picker()).toBeNull();
  });
});

describe('link columns', () => {
  it('adds an open link for a valid value and a warning for an invalid one', () => {
    const t = mountTable();

    t.configure({ setTableColumnType: { index: 1, type: 'email' } });
    t.set(1, 1, 'a@b.co');
    t.set(2, 1, 'oops');

    const link = t.td(1, 1).querySelector<HTMLAnchorElement>('[data-inkbrick-part="cell-link"]')!;

    expect(link.getAttribute('href')).toBe('mailto:a@b.co');
    expect(t.td(2, 1).querySelector('[data-inkbrick-part="cell-link"]')).toBeNull();
    expect(t.td(2, 1).querySelector('[data-inkbrick-part="cell-invalid"]')).not.toBeNull();
    expect(t.td(2, 0).querySelector('[data-inkbrick-part="cell-invalid"]')).toBeNull();
  });

  it('shows nothing for an empty cell and only http links open in a new tab', () => {
    const t = mountTable();

    t.configure({ setTableColumnType: { index: 1, type: 'url' } });
    t.set(1, 1, 'example.com');

    expect(t.td(2, 1).querySelector('[data-inkbrick-part="cell-link"]')).toBeNull();
    expect(
      t.td(1, 1).querySelector('[data-inkbrick-part="cell-link"]')!.getAttribute('target'),
    ).toBe('_blank');
  });
});

describe('column properties dialog', () => {
  const dialog = () => document.querySelector<HTMLElement>('[data-testid="column-properties"]');
  const part = (name: string) =>
    dialog()!.querySelector<HTMLElement & { value: string; disabled: boolean }>(
      `[data-inkbrick-part="${name}"]`,
    )!;

  function openDialog(t: ReturnType<typeof mountTable>, column: number) {
    act(() => t.caret(t.cell(1, column), 0));
    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-part="column-grip"]')!));
    act(
      () =>
        void fireEvent.click(
          document.querySelector('[data-testid="block-menu"] [data-action="column-properties"]')!,
        ),
    );
  }

  it('sets the type and the options in one undo step', () => {
    const t = mountTable();

    openDialog(t, 1);
    expect(dialog()).not.toBeNull();
    expect(part('options')).toBeNull();

    act(() => void fireEvent.change(part('type'), { target: { value: 'select' } }));
    act(() => void fireEvent.click(part('add')));
    act(() => void fireEvent.change(part('label'), { target: { value: 'Open' } }));
    act(() => void fireEvent.change(part('color'), { target: { value: 'green' } }));

    t.editor.clearHistory();
    act(() => void fireEvent.click(part('apply')));

    expect(dialog()).toBeNull();
    expect(t.props().columnTypes).toEqual(['text', 'select', 'text']);
    expect(t.props().columnOptions).toEqual([null, [{ label: 'Open', color: 'green' }], null]);

    act(() => t.editor.store.undo());
    expect(t.props().columnTypes).toBeUndefined();
    expect(t.props().columnOptions).toBeUndefined();
  });

  it('refuses empty, duplicate and comma names and Escape cancels without a change', () => {
    const t = mountTable();

    openDialog(t, 0);
    act(() => void fireEvent.change(part('type'), { target: { value: 'multiselect' } }));
    act(() => void fireEvent.click(part('add')));

    expect(part('apply').disabled).toBe(true);
    expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull();

    act(() => void fireEvent.change(part('label'), { target: { value: 'A,B' } }));
    expect(part('apply').disabled).toBe(true);

    act(() => void fireEvent.change(part('label'), { target: { value: 'A' } }));
    expect(part('apply').disabled).toBe(false);

    act(() => void fireEvent.keyDown(dialog()!, { key: 'Escape' }));
    expect(dialog()).toBeNull();
    expect(t.props().columnTypes).toBeUndefined();
  });

  it('switching back to text drops the options', () => {
    const t = mountTable();

    t.configure({
      setTableColumnType: { index: 1, type: 'select' },
      setTableColumnOptions: { index: 1, options: [{ label: 'A' }] },
    });

    openDialog(t, 1);
    expect(part('label').value).toBe('A');

    act(() => void fireEvent.change(part('type'), { target: { value: 'text' } }));
    act(() => void fireEvent.click(part('apply')));

    expect(t.props().columnTypes).toBeUndefined();
    expect(t.props().columnOptions).toBeUndefined();
  });
});
