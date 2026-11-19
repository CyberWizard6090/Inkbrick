import { describe, expect, it } from 'vitest';

import { tabularText } from '../src/clipboard/tabularText';

describe('tabularText', () => {
  it('two rows with tabs are a table, one row is text outside a table', () => {
    expect(tabularText('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(tabularText('x\ty')).toBeNull();
  });

  it('inside a table one row with tabs fills the cells next to each other', () => {
    expect(tabularText('x\ty', { singleRow: true })).toEqual([['x', 'y']]);
  });

  it('one trailing line break (as Excel adds it) is not a row', () => {
    expect(tabularText('x\ty\n', { singleRow: true })).toEqual([['x', 'y']]);
    expect(tabularText('x\ty\r\n', { singleRow: true })).toEqual([['x', 'y']]);
    expect(tabularText('x\ty\n')).toBeNull();
  });

  it('a single column is never a table', () => {
    expect(tabularText('x\n', { singleRow: true })).toBeNull();
  });
});
