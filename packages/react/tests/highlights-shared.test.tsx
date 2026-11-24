import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { setHighlight } from '@inkbrick/view';
import type { FindController } from '@inkbrick/view';

import { FindReplacePanel, TagHighlights, useFind } from '../src';
import { mountEditor } from './harness';

/** Подмена CSS Custom Highlight API: в jsdom его нет. */
class FakeHighlight {
  readonly ranges: Range[];

  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

const registry = new Map<string, FakeHighlight>();
const texts = (name: string) => registry.get(name)?.ranges.map((range) => range.toString()) ?? [];

beforeEach(() => {
  registry.clear();
  Object.assign(globalThis, { Highlight: FakeHighlight });
  Object.assign(globalThis.CSS ?? Object.assign(globalThis, { CSS: {} }).CSS, {
    highlights: registry,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis, 'Highlight');
  Reflect.deleteProperty(globalThis.CSS, 'highlights');
});

/** Монтирует редактор с панелью поиска и отдаёт его контроллер поиска. */
function mountWithFind(text: string): FindController {
  let controller!: FindController;
  const Probe = () => {
    controller = useFind().controller;

    return null;
  };

  mountEditor([text], {
    extra: (
      <>
        <Probe />
        <FindReplacePanel />
      </>
    ),
  });

  return controller;
}

const frame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

describe('setHighlight', () => {
  it('keeps the ranges of every owner and removes the highlight with the last one', () => {
    const a = {};
    const b = {};
    const range = (text: string) => {
      const node = document.createTextNode(text);
      const result = document.createRange();

      result.selectNodeContents(node);

      return result;
    };

    setHighlight('x', a, [range('one')]);
    setHighlight('x', b, [range('two')]);
    expect(texts('x')).toEqual(['one', 'two']);

    setHighlight('x', a, []);
    expect(texts('x')).toEqual(['two']);

    setHighlight('x', b, []);
    expect(registry.has('x')).toBe(false);
  });
});

describe('several editors on one page', () => {
  it('tag highlights of one editor do not wipe out the other, and closing one keeps the other', async () => {
    const first = mountEditor(['#alpha'], { extra: <TagHighlights /> });
    const second = mountEditor(['#beta'], { extra: <TagHighlights /> });

    await frame();
    expect(texts('inkbrick-tag').sort()).toEqual(['#alpha', '#beta']);

    act(() => {
      second.editor.dispatch({
        type: 'replaceText',
        payload: { blockId: second.ids[0], from: 5, to: 5, text: ' #gamma' },
      });
    });
    await frame();
    expect(texts('inkbrick-tag').sort()).toEqual(['#alpha', '#beta', '#gamma']);

    first.unmount();
    await frame();
    expect(texts('inkbrick-tag').sort()).toEqual(['#beta', '#gamma']);
  });

  it('find matches of one editor stay while another editor searches and closes its search', () => {
    const findA = mountWithFind('apple pie');
    const findB = mountWithFind('apple tart');

    act(() => {
      findA.open();
      findA.setQuery('apple');
      findB.open();
      findB.setQuery('apple');
    });
    expect(texts('inkbrick-find-current')).toEqual(['apple', 'apple']);

    act(() => findB.close());
    expect(texts('inkbrick-find-current')).toEqual(['apple']);

    act(() => findA.close());
    expect(registry.has('inkbrick-find-current')).toBe(false);
  });
});
