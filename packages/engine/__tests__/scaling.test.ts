import { describe, expect, it } from 'vitest';

import {
  createSchemaRegistry,
  deserializeDocument,
  repairSnapshot,
  serializeDocument,
  validateSnapshot,
  type DocumentSnapshot,
} from '@inkbrick/document';

import { Editor } from '../src';

/*
 * Защита от квадратичных регрессий. Абсолютное время на CI нестабильно, поэтому сравниваем рост: документ
 * в 10 раз больше должен обрабатываться примерно в 10 раз дольше (порог 30 — с запасом на шум),
 * а квадратичный алгоритм дал бы ×100.
 */
const schema = createSchemaRegistry();

function snapshotOf(count: number): DocumentSnapshot {
  const children = Array.from({ length: count }, (_, i) => `b${i}`);
  const blocks: DocumentSnapshot['blocks'] = {
    root: {
      id: 'root',
      flavour: 'block:page',
      parentId: null,
      children: ['note'],
      content: [],
      props: { title: '' },
    },
    note: { id: 'note', flavour: 'block:note', parentId: 'root', children, content: [], props: {} },
  };

  for (const id of children)
    blocks[id] = {
      id,
      flavour: 'block:paragraph',
      parentId: 'note',
      children: [],
      content: [{ insert: id }],
      props: {},
    };

  return { rootId: 'root', blocks };
}

function measure(fn: () => void, runs = 5): number {
  const times: number[] = [];

  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    fn();
    times.push(performance.now() - started);
  }

  return times.sort((a, b) => a - b)[Math.floor(runs / 2)] || 0.01;
}

const SMALL = 2_000;
const LARGE = 20_000;

describe('scaling (no quadratic algorithms)', () => {
  const small = snapshotOf(SMALL);
  const large = snapshotOf(LARGE);

  const ratio = (fn: (snapshot: DocumentSnapshot) => void) => {
    fn(small); // прогрев JIT
    return measure(() => fn(large)) / measure(() => fn(small));
  };

  it('validateSnapshot', () => {
    expect(ratio((s) => validateSnapshot(s, schema))).toBeLessThan(30);
  });

  it('deserialize + serialize', () => {
    expect(
      ratio((s) => serializeDocument(deserializeDocument(s, { schema }), schema)),
    ).toBeLessThan(30);
  });

  it('repairSnapshot', () => {
    expect(ratio((s) => repairSnapshot(s, schema))).toBeLessThan(30);
  });

  it('typing into a block does not depend on the document size', () => {
    const typing = (snapshot: DocumentSnapshot) => {
      const editor = new Editor({ schema, document: deserializeDocument(snapshot, { schema }) });

      return () => {
        for (let i = 0; i < 50; i++)
          editor.dispatch({
            type: 'replaceText',
            payload: { blockId: 'b1', from: 0, to: 0, text: 'x' },
          });
      };
    };
    const smallTyping = typing(small);
    const largeTyping = typing(large);

    smallTyping();
    expect(measure(largeTyping) / measure(smallTyping)).toBeLessThan(5);
  });
});
