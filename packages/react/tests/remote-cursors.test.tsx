import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Editor } from '@inkbrick/engine';

import {
  DocumentView,
  EditorProvider,
  RemoteCursors,
  layoutCursors,
  rangeForPoints,
  type RemoteCursor,
} from '../src';

globalThis.CSS ??= {} as typeof CSS;
CSS.escape ??= (value: string) => value.replace(/["\\]/g, '\\$&');

// jsdom does not lay text out: every range reports one line box, which is enough to test where the overlay puts things.
const LINE = new DOMRect(40, 30, 60, 18);

beforeEach(() => {
  Range.prototype.getClientRects = function () {
    return this.collapsed ? ([] as unknown as DOMRectList) : ([LINE] as unknown as DOMRectList);
  };
  Range.prototype.getBoundingClientRect = function () {
    return this.collapsed ? new DOMRect(0, 0, 0, 0) : LINE;
  };
});

afterEach(() => vi.restoreAllMocks());

function setup(texts: string[]) {
  const editor = new Editor();
  const doc = editor.document;
  const noteId = doc.getBlock(doc.rootId)!.children[0];
  const ids = [doc.getBlock(noteId)!.children[0]];

  for (let i = 1; i < texts.length; i++) {
    const created = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
    }) as { blockId: string };

    ids.push(created.blockId);
  }

  texts.forEach((text, i) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } }),
  );

  const view = render(
    <EditorProvider editor={editor} formulaRenderer={false} highlighter={false}>
      <DocumentView />
    </EditorProvider>,
  );
  const root = view.container.querySelector<HTMLElement>('[data-inkbrick-root]')!;

  return { editor, ids, root, view };
}

describe('rangeForPoints', () => {
  it('spans the text between two points, in either order', () => {
    const { ids, root } = setup(['hello world']);
    const forward = rangeForPoints(
      root,
      { blockId: ids[0], offset: 2 },
      { blockId: ids[0], offset: 7 },
    )!;
    const backward = rangeForPoints(
      root,
      { blockId: ids[0], offset: 7 },
      { blockId: ids[0], offset: 2 },
    )!;

    expect(forward.toString()).toBe('llo w');
    expect(backward.toString()).toBe('llo w');
  });

  it('spans several blocks and returns null for a block that is not drawn', () => {
    const { ids, root } = setup(['one', 'two']);

    expect(
      rangeForPoints(
        root,
        { blockId: ids[0], offset: 1 },
        { blockId: ids[1], offset: 2 },
      )!.toString(),
    ).toContain('ne');
    expect(rangeForPoints(root, { blockId: 'missing', offset: 0 })).toBeNull();
  });
});

describe('layoutCursors', () => {
  it('puts the caret relative to the layer origin and boxes the selection', () => {
    const { ids, root } = setup(['hello world']);
    const cursor: RemoteCursor = {
      id: 1,
      name: 'Анна',
      color: '#2f6fed',
      head: { blockId: ids[0], offset: 5 },
      anchor: { blockId: ids[0], offset: 0 },
    };
    const [result] = layoutCursors(root, { left: 10, top: 20 }, [cursor]);

    expect(result.selection).toEqual([{ left: 30, top: 10, width: 60, height: 18 }]);
    expect(result.caret).not.toBeNull();
    expect(result.caret!.width).toBe(2);
  });

  it('draws no selection for a collapsed cursor and no caret when the block is missing', () => {
    const { ids, root } = setup(['text']);
    const [collapsed, lost] = layoutCursors(root, { left: 0, top: 0 }, [
      {
        id: 1,
        name: 'a',
        color: '#000',
        head: { blockId: ids[0], offset: 2 },
        anchor: { blockId: ids[0], offset: 2 },
      },
      { id: 2, name: 'b', color: '#000', head: { blockId: 'gone', offset: 0 } },
    ]);

    expect(collapsed.selection).toEqual([]);
    expect(lost.caret).toBeNull();
  });
});

describe('<RemoteCursors>', () => {
  function mount(cursors: RemoteCursor[]) {
    const editor = new Editor();
    const doc = editor.document;
    const first = doc.getBlock(doc.getBlock(doc.rootId)!.children[0])!.children[0];

    editor.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 0, to: 0, text: 'collaborate' },
    });

    const make = (list: RemoteCursor[]) => (
      <EditorProvider editor={editor} formulaRenderer={false} highlighter={false}>
        <div style={{ position: 'relative' }}>
          <DocumentView />
          <RemoteCursors
            cursors={list.map((item) => ({
              ...item,
              head: { ...item.head, blockId: first },
              anchor: item.anchor && { ...item.anchor, blockId: first },
            }))}
          />
        </div>
      </EditorProvider>
    );
    const view = render(make(cursors));

    return { editor, first, view, rerender: (list: RemoteCursor[]) => view.rerender(make(list)) };
  }

  const cursor = (
    id: number,
    name: string,
    color: string,
    offset: number,
    anchor?: number,
  ): RemoteCursor => ({
    id,
    name,
    color,
    head: { blockId: '', offset },
    anchor: anchor === undefined ? undefined : { blockId: '', offset: anchor },
  });

  it('draws a caret with the name and a highlight for each person, hidden from assistive technology', () => {
    const { view } = mount([cursor(1, 'Анна', '#2f6fed', 4, 0), cursor(2, 'Борис', '#d9531e', 8)]);
    const layer = view.container.querySelector('[data-inkbrick-ui="remote-cursors"]')!;

    expect(layer.getAttribute('aria-hidden')).toBe('true');

    const flags = [...layer.querySelectorAll('[data-inkbrick-part="remote-flag"]')].map(
      (item) => item.textContent,
    );

    expect(flags).toEqual(['Анна', 'Борис']);
    expect(layer.querySelectorAll('[data-inkbrick-part="remote-selection"]')).toHaveLength(1);

    const first = layer.querySelector<HTMLElement>('[data-inkbrick-ui="remote-cursor"]')!;

    expect(first.style.getPropertyValue('--inkbrick-remote-color')).toBe('#2f6fed');
  });

  it('follows changes of the cursors and of the document', async () => {
    const { editor, first, view, rerender } = mount([cursor(1, 'Анна', '#2f6fed', 4)]);
    const flags = () =>
      [...view.container.querySelectorAll('[data-inkbrick-part="remote-flag"]')].map(
        (item) => item.textContent,
      );

    expect(flags()).toEqual(['Анна']);

    rerender([cursor(1, 'Анна', '#2f6fed', 4), cursor(2, 'Вера', '#1f9d6b', 1)]);
    expect(flags()).toEqual(['Анна', 'Вера']);

    rerender([]);
    expect(flags()).toEqual([]);

    // A change of the document re-measures without new props.
    const measured = vi.spyOn(Range.prototype, 'getClientRects');

    rerender([cursor(3, 'Глеб', '#9b59d0', 2)]);
    measured.mockClear();
    await act(async () => {
      editor.dispatch({
        type: 'insertText',
        payload: { text: '!', selection: { anchor: { blockId: first, offset: 0 } } },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(measured).toHaveBeenCalled();
  });
});
