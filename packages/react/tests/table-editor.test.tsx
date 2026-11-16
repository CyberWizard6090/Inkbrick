import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { createTableEditor, tableCellAt, tableIdOf, tableValue } from '@inkbrick/engine';

import { TableEditor } from '../src';
import './harness';

afterEach(cleanup);

const cellsOf = (container: HTMLElement) => container.querySelectorAll('td');

describe('TableEditor', () => {
  it('renders the given rows as the only content, without block handles', () => {
    const { container } = render(
      <TableEditor
        rows={[
          ['Name', 'Qty'],
          ['Apple', '3'],
        ]}
        formulaRenderer={false}
        highlighter={false}
      />,
    );

    expect([...cellsOf(container)].map((cell) => cell.textContent)).toEqual([
      'Name',
      'Qty',
      'Apple',
      '3',
    ]);
    expect(container.querySelectorAll('[data-inkbrick-block="table"]')).toHaveLength(1);
    expect(container.querySelectorAll('.editable:not(td .editable)')).toHaveLength(0);
    expect(container.querySelector('[data-inkbrick-block-ui]')).toBeNull();
  });

  it('starts from an empty 3×3 table', () => {
    const { container } = render(<TableEditor />);

    expect(cellsOf(container)).toHaveLength(9);
  });

  it('reports every change with the plain value, also on undo', () => {
    const onChange = vi.fn();
    const editor = createTableEditor({ rows: [['a']] });

    render(<TableEditor editor={editor} onChange={onChange} />);

    const cell = tableCellAt((id) => editor.document.getBlock(id), tableIdOf(editor)!, 0, 0)!;

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: cell, from: 1, to: 1, text: 'b' },
      });
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ rows: [['ab']], header: true }),
    );

    act(() => {
      editor.store.undo();
    });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ rows: [['a']] }));
  });

  it('keeps using the editor it was given; the initial props are read once', () => {
    const { container, rerender } = render(<TableEditor rows={[['one']]} />);

    rerender(<TableEditor rows={[['two']]} />);

    expect(container.querySelector('td')!.textContent).toBe('one');
  });

  it('cannot lose its table, and is read-only on request', () => {
    const editor = createTableEditor({ rows: [['a', 'b']] });
    const { container } = render(<TableEditor editor={editor} readOnly />);

    expect(container.querySelector('[data-inkbrick-root]')!.getAttribute('contenteditable')).toBe(
      'false',
    );

    act(() => {
      editor.dispatch({ type: 'delete-block', payload: { id: tableIdOf(editor)! } } as never);
    });

    expect(tableValue(editor).rows).toEqual([['a', 'b']]);
  });
});

describe('TableEditor changeDelay', () => {
  it('reports once after a pause, and flushes on unmount', () => {
    vi.useFakeTimers();

    try {
      const onChange = vi.fn();
      const editor = createTableEditor({ rows: [['a']] });
      const view = render(<TableEditor editor={editor} onChange={onChange} changeDelay={200} />);
      const cell = tableCellAt((id) => editor.document.getBlock(id), tableIdOf(editor)!, 0, 0)!;
      const type = (text: string, at: number) =>
        act(() => {
          editor.dispatch({
            type: 'replaceText',
            payload: { blockId: cell, from: at, to: at, text },
          });
        });

      type('b', 1);
      type('c', 2);
      expect(onChange).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ rows: [['abc']] }));

      type('d', 3);
      view.unmount();
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ rows: [['abcd']] }));
    } finally {
      vi.useRealTimers();
    }
  });
});
