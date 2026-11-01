import { describe, expect, it } from 'vitest';

import { normalizeInlineNodes, splitNodesAt } from '../src';

describe('InlineNodeUtils', () => {
  it('merges neighbours with equal attributes and drops empty nodes', () => {
    expect(
      normalizeInlineNodes([
        { insert: 'a' },
        { insert: '' },
        { insert: 'b' },
        { insert: 'c', attributes: { bold: true } },
        { insert: 'd', attributes: { bold: true } },
      ]),
    ).toEqual([{ insert: 'ab' }, { insert: 'cd', attributes: { bold: true } }]);
  });

  it('splits nodes at offsets without losing attributes', () => {
    expect(splitNodesAt([{ insert: 'hello', attributes: { bold: true } }], 2)).toEqual([
      { insert: 'he', attributes: { bold: true } },
      { insert: 'llo', attributes: { bold: true } },
    ]);
  });
});
