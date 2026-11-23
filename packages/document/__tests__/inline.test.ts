import { describe, expect, it } from 'vitest';

import {
  createDocument,
  createSchemaRegistry,
  deserializeDocument,
  normalizeInlineNodes,
  serializeDocument,
  splitNodesAt,
} from '../src';

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

describe('inline code takes no formatting except a link', () => {
  it('normalizeInlineNodes drops bold, italic, underline, strike, colour and background from code', () => {
    expect(
      normalizeInlineNodes([
        {
          insert: 'x',
          attributes: {
            code: true,
            bold: true,
            italic: true,
            underline: true,
            strike: true,
            color: 'red',
            backgroundColor: 'yellow',
            link: 'https://x.org',
          },
        },
        { insert: 'y', attributes: { code: true, link: 'https://x.org' } },
        { insert: 'z', attributes: { bold: true, color: 'red' } },
      ]),
    ).toEqual([
      { insert: 'xy', attributes: { code: true, link: 'https://x.org' } },
      { insert: 'z', attributes: { bold: true, color: 'red' } },
    ]);
  });

  it('a document saved with formatted code opens with plain code', () => {
    const schema = createSchemaRegistry();
    const snapshot = serializeDocument(createDocument(), schema);
    const note = snapshot.blocks[snapshot.rootId].children[0];
    const paragraph = snapshot.blocks[note].children[0];

    snapshot.blocks[paragraph].content = [
      { insert: 'fn', attributes: { code: true, bold: true, color: 'red' } },
    ];

    const document = deserializeDocument(snapshot, { schema });

    expect(document.getBlock(paragraph)!.content).toEqual([
      { insert: 'fn', attributes: { code: true } },
    ]);
  });
});
