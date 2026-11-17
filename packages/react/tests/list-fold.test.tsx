import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { estimateSubtree } from '../src/renderer/virtual/estimate';
import { folding, listFolding } from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

/** Список «parent» с двумя вложенными пунктами и пункт «after» после него. */
function mountList(readOnly = false, provider: object = listFolding) {
  const mounted = mountEditor(['parent', 'child one', 'child two', 'after'], provider);
  const { editor, ids } = mounted;

  act(() => {
    for (const id of ids) {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: id, flavour: 'block:list', props: { type: 'bullet' } },
      });
    }

    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[1] } });
    editor.dispatch({ type: 'indentBlock', payload: { blockId: ids[2] } });
    editor.clearHistory();
  });

  if (readOnly) act(() => editor.setReadOnly(true));

  const arrows = () => [
    ...mounted.root.querySelectorAll<HTMLElement>('[data-inkbrick-part="fold"]'),
  ];
  const shown = (id: string) => mounted.root.querySelector(`.editable[data-id="${id}"]`) !== null;

  return { ...mounted, arrows, shown };
}

describe('list item folding', () => {
  it('has an arrow only on an item with nested blocks, and not without the folding provider', () => {
    const { arrows, editor, ids } = mountList();

    expect(editor.document.getBlock(ids[0])!.children).toEqual([ids[1], ids[2]]);
    expect(arrows()).toHaveLength(1);
    expect(arrows()[0].getAttribute('aria-expanded')).toBe('true');

    cleanup();

    expect(mountList(false, {}).arrows()).toHaveLength(0);
  });

  it('hides the nested blocks when collapsed and brings them back, undoably', () => {
    const { arrows, shown, editor, ids } = mountList();

    expect(shown(ids[1])).toBe(true);

    fireEvent.click(arrows()[0]);

    expect(shown(ids[1])).toBe(false);
    expect(shown(ids[2])).toBe(false);
    expect(shown(ids[3])).toBe(true);
    expect(arrows()[0].getAttribute('aria-expanded')).toBe('false');
    expect(editor.document.getBlock(ids[0])!.props.collapsed).toBe(true);

    act(() => editor.store.undo());
    expect(shown(ids[1])).toBe(true);

    act(() => editor.store.redo());
    expect(shown(ids[1])).toBe(false);

    fireEvent.click(arrows()[0]);
    expect(shown(ids[1])).toBe(true);
  });

  it('moves a caret that was inside the hidden blocks to the item', () => {
    const { arrows, caret, ids } = mountList();

    caret(ids[1], 3);
    fireEvent.click(arrows()[0]);

    const anchor = getSelection()!.anchorNode?.parentElement?.closest('.editable');

    expect(anchor?.getAttribute('data-id')).toBe(ids[0]);
  });

  it('Ctrl+Enter collapses and expands the item under the caret', () => {
    const { key, caret, shown, ids, editor } = mountList();

    caret(ids[0], 2);
    key('Enter', { ctrl: true });

    expect(editor.document.getBlock(ids[0])!.props.collapsed).toBe(true);
    expect(shown(ids[1])).toBe(false);

    key('Enter', { ctrl: true });
    expect(editor.document.getBlock(ids[0])!.props.collapsed).toBe(false);
    expect(shown(ids[1])).toBe(true);
  });

  it('Tab into a collapsed item expands it first: the nested block must not disappear', () => {
    const { arrows, caret, key, shown, editor, ids } = mountList();

    fireEvent.click(arrows()[0]);
    caret(ids[3], 0);
    key('Tab');

    const parent = editor.document.getBlock(ids[0])!;

    expect(parent.props.collapsed).toBe(false);
    expect(parent.children).toEqual([ids[1], ids[2], ids[3]]);
    expect(shown(ids[3])).toBe(true);
  });

  it('in a read-only document the reader folds for themselves and the document stays the same', () => {
    const { arrows, shown, editor, ids } = mountList(true);

    fireEvent.click(arrows()[0]);

    expect(shown(ids[1])).toBe(false);
    expect(editor.document.getBlock(ids[0])!.props.collapsed).toBeUndefined();

    fireEvent.click(arrows()[0]);
    expect(shown(ids[1])).toBe(true);
  });

  it('works together with the heading folding', () => {
    const { arrows } = mountList(false, folding);

    expect(arrows()).toHaveLength(1);
  });
});

describe('height estimate with folded blocks', () => {
  const block = (
    id: string,
    children: string[],
    props: Record<string, unknown> = {},
    flavour = 'block:list',
  ) => ({ id, flavour, children, props, content: [], parentId: null }) as never;
  const tree: Record<string, never> = {
    root: block('root', ['a', 'b'], {}, 'block:list'),
    a: block('a', ['a1', 'a2'], { collapsed: true }),
    a1: block('a1', []),
    a2: block('a2', []),
    b: block('b', ['b1'], {}, 'block:toggle'),
    b1: block('b1', []),
  };
  const get = (id: string) => tree[id];
  const one = () => 34;

  it('does not count the children of a collapsed item or of a closed toggle', () => {
    // root + a (children hidden) + b + b1
    expect(estimateSubtree(get, 'root', one)).toBe(4 * 34);

    tree.b = block('b', ['b1'], { open: false }, 'block:toggle');

    // root + a + b (closed): b1 is hidden too
    expect(estimateSubtree(get, 'root', one)).toBe(3 * 34);
  });
});
