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
