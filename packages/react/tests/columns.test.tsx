import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import type { CaretResult } from '@inkbrick/engine';

import { columnsBlocks } from '../src';
import { mountEditor } from './harness';

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
  cleanup();
});

function mountColumns(props: Parameters<typeof mountEditor>[1] = {}) {
  const mounted = mountEditor(['before'], { blocks: columnsBlocks, ...props });
  const { editor, ids, root } = mounted;
  let caret!: CaretResult;

  act(() => {
    caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:columns', afterId: ids[0], props: { ratios: [1, 1, 1] } },
    }) as CaretResult;
  });

  const get = (id: string) => editor.document.getBlock(id)!;
  const columnsId = get(get(caret.blockId).parentId!).parentId!;
  const columns = root.querySelector<HTMLElement>('[data-inkbrick-block="columns"]')!;
  const columnIds = () => get(columnsId).children;
  const divider = (index: number) =>
    root.querySelectorAll<HTMLElement>('[data-inkbrick-part="divider"]')[index];
  const tool = (label: RegExp) =>
    [...columns.querySelectorAll<HTMLButtonElement>('[data-inkbrick-part="toolbar"] button')].find(
      (button) => label.test(button.getAttribute('aria-label') ?? ''),
    )!;
  const ratios = () => get(columnsId).props.ratios;

  return { ...mounted, columnsId, columns, columnIds, divider, tool, ratios, get };
}

describe('columns', () => {
  it('renders a grid of columns, each with its blocks, and a divider between neighbours only', () => {
    const t = mountColumns();

    expect(t.root.querySelectorAll('[data-inkbrick-block="column"]')).toHaveLength(3);
    expect(t.root.querySelectorAll('[data-inkbrick-part="divider"]')).toHaveLength(2);
    expect(t.columns.style.getPropertyValue('--inkbrick-columns')).toBe(
      `minmax(0, ${1 / 3}fr) minmax(0, ${1 / 3}fr) minmax(0, ${1 / 3}fr)`,
    );
  });

  it('gives every divider its width as a percentage for assistive technology', () => {
    const t = mountColumns();

    expect(t.divider(0).getAttribute('aria-valuenow')).toBe('33');
    expect(t.divider(0).getAttribute('aria-valuemin')).toBe('8');

    act(() => {
      t.editor.dispatch({
        type: 'setColumnRatios',
        payload: { blockId: t.columnsId, ratios: [1, 2, 1] },
      } as never);
    });

    expect(t.divider(0).getAttribute('aria-valuenow')).toBe('25');
    expect(t.divider(1).getAttribute('aria-valuenow')).toBe('50');
  });

  it('follows the ratios', () => {
    const t = mountColumns();

    act(() => {
      t.editor.dispatch({
        type: 'setColumnRatios',
        payload: { blockId: t.columnsId, ratios: [1, 2, 1] },
      } as never);
    });

    expect(t.columns.style.getPropertyValue('--inkbrick-columns')).toBe(
      'minmax(0, 0.25fr) minmax(0, 0.5fr) minmax(0, 0.25fr)',
    );
  });

  it('the toolbar adds a column, removes the last one and turns the columns into plain blocks', () => {
    const t = mountColumns();

    act(() => void fireEvent.click(t.tool(/Add a column/)));
    expect(t.columnIds()).toHaveLength(4);

    act(() => void fireEvent.click(t.tool(/Remove the last column/)));
    expect(t.columnIds()).toHaveLength(3);

    act(() => void fireEvent.click(t.tool(/plain blocks/)));
    expect(t.editor.document.getBlock(t.columnsId)).toBeUndefined();
    expect(t.root.querySelector('[data-inkbrick-block="columns"]')).toBeNull();
  });

  it('adding stops at six columns', () => {
    const t = mountColumns();

    for (let i = 0; i < 5; i++) {
      if (!t.tool(/Add a column/).disabled) act(() => void fireEvent.click(t.tool(/Add a column/)));
    }

    expect(t.columnIds()).toHaveLength(6);
    expect(t.tool(/Add a column/).disabled).toBe(true);
  });

  it('dragging a divider previews the widths and writes them in one undo step', () => {
    const t = mountColumns();
    const widths = new Map<string, number>(t.columnIds().map((id) => [id, 300]));

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const width = widths.get(this.getAttribute('data-block-id') ?? '') ?? 0;

      return new DOMRect(0, 0, width, 20);
    });

    act(() => void fireEvent.pointerDown(t.divider(0), { button: 0, clientX: 300 }));
    act(
      () =>
        void document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 390 })),
    );

    expect(t.columns.style.getPropertyValue('--inkbrick-columns')).toContain('0.4333');

    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));

    expect(t.ratios()).toEqual([0.433, 0.233, 0.333]);

    act(() => void t.editor.undo());
    expect(t.ratios()).toEqual([1, 1, 1]);
  });

  it('a divider cannot squeeze a column away', () => {
    const t = mountColumns();
    const widths = new Map<string, number>(t.columnIds().map((id) => [id, 300]));

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, 0, widths.get(this.getAttribute('data-block-id') ?? '') ?? 0, 20);
    });

    act(() => void fireEvent.pointerDown(t.divider(0), { button: 0, clientX: 300 }));
    act(
      () =>
        void document.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: -9000 }),
        ),
    );
    act(() => void document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));

    expect(Math.min(...(t.ratios() as number[]))).toBeGreaterThanOrEqual(0.08);
  });

  it('arrow keys on a divider move it', () => {
    const t = mountColumns();
    const widths = new Map<string, number>(t.columnIds().map((id) => [id, 300]));

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, 0, widths.get(this.getAttribute('data-block-id') ?? '') ?? 0, 20);
    });

    act(() => void fireEvent.keyDown(t.divider(1), { key: 'ArrowRight' }));

    const [a, b, c] = t.ratios() as number[];

    expect(a).toBeCloseTo(1 / 3, 2);
    expect(b).toBeGreaterThan(c);
  });

  it('read-only: no dividers, no toolbar', () => {
    const t = mountColumns();

    act(() => t.editor.setReadOnly(true));

    expect(t.root.querySelector('[data-inkbrick-part="divider"]')).toBeNull();
    expect(t.root.querySelector('[data-inkbrick-part="toolbar"]')).toBeNull();
    expect(t.root.querySelectorAll('[data-inkbrick-block="column"]')).toHaveLength(3);
  });
});
