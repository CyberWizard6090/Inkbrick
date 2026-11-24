import { describe, expect, it } from 'vitest';

import { tabularText } from '../src/internal';

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

  it('a table over the limit of cells or columns stays text', () => {
    const wide = Array.from({ length: 2 }, () =>
      Array.from({ length: 51 }, (_, i) => `c${i}`).join('\t'),
    );
    const long = Array.from({ length: 100 }, () =>
      Array.from({ length: 30 }, () => 'v').join('\t'),
    );

    expect(tabularText(wide.join('\n'))).toBeNull();
    expect(tabularText(long.join('\n'))).toBeNull();
  });
});
