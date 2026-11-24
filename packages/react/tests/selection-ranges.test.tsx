import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';

import { readDocSelection } from '@inkbrick/view';
import { mountEditor } from './harness';

const native = globalThis.getSelection;

afterEach(() => {
  globalThis.getSelection = native;
  cleanup();
});

describe('selection made of several ranges (Firefox across table cells)', () => {
  it('reads one selection from the first range start to the last range end', () => {
    const { root, ids, editable } = mountEditor(['one', 'two', 'three']);
    const text = (id: string) => editable(id).firstChild!;
    const make = (node: Node, start: number, end: number) => {
      const range = document.createRange();

      range.setStart(node, start);
      range.setEnd(node, end);

      return range;
    };
    const ranges = [make(text(ids[0]), 1, 3), make(text(ids[1]), 0, 3), make(text(ids[2]), 0, 2)];
    const fake = {
      rangeCount: ranges.length,
      getRangeAt: (index: number) => ranges[index],
    } as unknown as Selection;

    globalThis.getSelection = () => fake;

    const selection = readDocSelection(root)!;

    expect(selection.from).toEqual({ blockId: ids[0], offset: 1 });
    expect(selection.to).toEqual({ blockId: ids[2], offset: 2 });
    expect(selection.collapsed).toBe(false);
  });
});
