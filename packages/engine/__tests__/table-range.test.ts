import { describe, expect, it } from 'vitest';

import {
  clampTableRange,
  createTableEditor,
  fragmentToPlainText,
  tableIdOf,
  tableRangeBetween,
  tableRangeCells,
  tableRangeFragment,
} from '../src';

function setup() {
  const editor = createTableEditor({
    rows: [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ],
  });
  const getBlock = (id: string) => editor.document.getBlock(id);

  return { editor, getBlock, tableId: tableIdOf(editor)! };
}

describe('table ranges', () => {
  it('builds a rectangle between two cells in any order and clamps it to the table', () => {
    const { getBlock, tableId } = setup();

    expect(tableRangeBetween({ row: 2, column: 0 }, { row: 1, column: 2 })).toEqual({
      top: 1,
      left: 0,
      bottom: 2,
      right: 2,
    });
    expect(clampTableRange(getBlock, tableId, { top: -2, left: 1, bottom: 9, right: 9 })).toEqual({
      top: 0,
      left: 1,
      bottom: 2,
      right: 2,
    });
    expect(
      clampTableRange(getBlock, tableId, { top: 5, left: 0, bottom: 6, right: 1 }),
    ).toBeUndefined();
    expect(
      clampTableRange(getBlock, 'nope', { top: 0, left: 0, bottom: 0, right: 0 }),
    ).toBeUndefined();
  });

  it('lists the cells of a rectangle by rows', () => {
    const { editor, getBlock, tableId } = setup();
    const text = (id: string) => editor.engine.inline.toPlainText(getBlock(id)!.content);
    const cells = tableRangeCells(getBlock, tableId, { top: 1, left: 1, bottom: 2, right: 2 });

    expect(cells.map((row) => row.map(text))).toEqual([
      ['e', 'f'],
      ['h', 'i'],
    ]);
  });

  it('makes a fragment of only those cells; the header stays only with the first row', () => {
    const { getBlock, tableId } = setup();
    const inner = tableRangeFragment(getBlock, tableId, { top: 1, left: 0, bottom: 2, right: 1 });
    const top = tableRangeFragment(getBlock, tableId, { top: 0, left: 1, bottom: 1, right: 2 });

    expect(fragmentToPlainText(inner)).toBe('d\te\ng\th');
    expect(inner.blocks[0].props.header).toBe(false);
    expect(fragmentToPlainText(top)).toBe('b\tc\ne\tf');
    expect(top.blocks[0].props.header).toBe(true);
    expect(
      tableRangeFragment(getBlock, tableId, { top: 7, left: 0, bottom: 8, right: 0 }).blocks,
    ).toEqual([]);
  });

  it('carries the alignment of the columns', () => {
    const { editor, getBlock, tableId } = setup();
    const cell = getBlock(getBlock(tableId)!.children[0])!.children[1];

    editor.dispatch({
      type: 'setAlign',
      payload: {
        from: { blockId: cell, offset: 0 },
        to: { blockId: cell, offset: 0 },
        align: 'right',
      },
    });

    const fragment = tableRangeFragment(getBlock, tableId, {
      top: 0,
      left: 1,
      bottom: 0,
      right: 2,
    });
    const first = fragment.blocks[0].children[0].children[0];

    expect(first.props.align).toBe('right');
  });
});
