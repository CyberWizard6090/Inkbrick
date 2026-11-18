import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { FRAGMENT_MIME } from '@inkbrick/engine';

import { FindReplacePanel, useFind } from '../src';
import type { EditorView } from '../src/editing/EditorView';
import { useEditorView } from '../src/hooks/useEditorView';
import { mountEditor } from './harness';

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
  cleanup();
});

let captured: EditorView | null = null;

function Capture() {
  captured = useEditorView();

  return null;
}

function mount(texts: string[]) {
  const mounted = mountEditor(texts, { extra: <Capture /> });
  const picked = () => captured!.picked.getState().ids;
  const note = mounted.editor.document.getBlock(mounted.editor.document.rootId)!.children[0];
  const order = () =>
    mounted.editor.document
      .getBlock(note)!
      .children.map((id) =>
        mounted.editor.engine.inline.toPlainText(mounted.editor.document.getBlock(id)!.content),
      );
  const marks = () =>
    mounted.ids.map((id) =>
      document.querySelector(`[data-block-id="${id}"]`)!.hasAttribute('data-picked'),
    );

  return { ...mounted, picked, order, marks, note };
}

function OpenFind() {
  const { controller } = useFind();

  useEffect(() => controller.open(), [controller]);

  return <FindReplacePanel />;
}

describe('picking blocks', () => {
  it('a search open in another editor on the page does not stop Escape from picking here', () => {
    mountEditor(['other'], { extra: <OpenFind /> });
    expect(document.querySelector('[data-inkbrick-ui="find"]')).not.toBeNull();

    const t = mount(['one', 'two']);

    t.caret(t.ids[0], 1);
    t.key('Escape');
    expect(t.picked()).toEqual([t.ids[0]]);
  });

  it('Escape picks the block under the caret and marks it; a second Escape returns the caret', () => {
    const t = mount(['one', 'two', 'three']);

    t.caret(t.ids[1], 1);
    t.key('Escape');

    expect(t.picked()).toEqual([t.ids[1]]);
    expect(t.marks()).toEqual([false, true, false]);

    t.key('Escape');
    expect(t.picked()).toEqual([]);
    expect(t.marks()).toEqual([false, false, false]);
    expect(getSelection()!.anchorNode).toBeTruthy();
  });

  it('Escape over a text range picks the whole run of blocks it covers', () => {
    const t = mount(['one', 'two', 'three', 'four']);

    t.select({ blockId: t.ids[0], offset: 1 }, { blockId: t.ids[2], offset: 2 });
    t.key('Escape');

    expect(t.picked()).toEqual([t.ids[0], t.ids[1], t.ids[2]]);
    expect(t.marks()).toEqual([true, true, true, false]);
  });

  it('Shift+arrows extend and shrink from the anchor, plain arrows move the pick', () => {
    const t = mount(['one', 'two', 'three', 'four']);

    t.caret(t.ids[1], 0);
    t.key('Escape');
    t.key('ArrowDown', { shift: true });
    t.key('ArrowDown', { shift: true });
    expect(t.picked()).toEqual([t.ids[1], t.ids[2], t.ids[3]]);

    t.key('ArrowDown', { shift: true });
    expect(t.picked()).toEqual([t.ids[1], t.ids[2], t.ids[3]]);

    t.key('ArrowUp', { shift: true });
    expect(t.picked()).toEqual([t.ids[1], t.ids[2]]);

    t.key('ArrowUp', { shift: true });
    t.key('ArrowUp', { shift: true });
    expect(t.picked()).toEqual([t.ids[0], t.ids[1]]);

    t.key('ArrowDown');
    expect(t.picked()).toEqual([t.ids[1]]);
  });

  it('Enter puts the caret into the picked block and clicking elsewhere drops the pick', () => {
    const t = mount(['one', 'two']);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    t.key('Enter');

    expect(t.picked()).toEqual([]);
    expect(getSelection()!.anchorNode).toBeTruthy();

    t.key('Escape');
    expect(t.picked()).toEqual([t.ids[0]]);

    act(() => void t.root.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(t.picked()).toEqual([]);
  });

  it('typing with picked blocks changes nothing and does not drop the pick', () => {
    const t = mount(['one', 'two']);

    t.caret(t.ids[0], 0);
    t.key('Escape');

    expect(t.key('x').defaultPrevented).toBe(true);
    expect(t.order()).toEqual(['one', 'two']);
    expect(t.picked()).toEqual([t.ids[0]]);
  });
});

describe('actions on picked blocks', () => {
  it('Delete removes them in one undo step and Backspace does the same', () => {
    const t = mount(['one', 'two', 'three', 'four']);

    t.caret(t.ids[1], 0);
    t.key('Escape');
    t.key('ArrowDown', { shift: true });
    t.editor.clearHistory();
    t.key('Delete');

    expect(t.order()).toEqual(['one', 'four']);
    expect(t.picked()).toEqual([]);

    act(() => t.editor.store.undo());
    expect(t.order()).toEqual(['one', 'two', 'three', 'four']);
  });

  it('removing every block leaves an empty paragraph to type in', () => {
    const t = mount(['one', 'two']);

    t.select({ blockId: t.ids[0], offset: 0 }, { blockId: t.ids[1], offset: 3 });
    t.key('Escape');
    t.key('Backspace');

    expect(t.order()).toEqual(['']);
  });

  it('Ctrl+D duplicates the run after its last block, in order, in one step', () => {
    const t = mount(['one', 'two', 'three']);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    t.key('ArrowDown', { shift: true });
    t.editor.clearHistory();
    t.key('d', { ctrl: true });

    expect(t.order()).toEqual(['one', 'two', 'one', 'two', 'three']);
    // Выбраны копии.
    expect(t.picked()).toHaveLength(2);
    expect(t.picked()).not.toContain(t.ids[0]);

    act(() => t.editor.store.undo());
    expect(t.order()).toEqual(['one', 'two', 'three']);
  });

  it('Ctrl+D with the caret duplicates the current block', () => {
    const t = mount(['one', 'two']);

    t.caret(t.ids[0], 1);
    t.key('d', { ctrl: true });

    expect(t.order()).toEqual(['one', 'one', 'two']);
    expect(t.picked()).toEqual([]);
  });

  it('Ctrl+Shift+arrows move the picked run one step and keep its order, in one step', () => {
    const t = mount(['one', 'two', 'three', 'four']);

    t.caret(t.ids[1], 0);
    t.key('Escape');
    t.key('ArrowDown', { shift: true });
    t.editor.clearHistory();

    t.key('ArrowDown', { ctrl: true, shift: true });
    expect(t.order()).toEqual(['one', 'four', 'two', 'three']);

    t.key('ArrowDown', { ctrl: true, shift: true });
    expect(t.order()).toEqual(['one', 'four', 'two', 'three']);

    t.key('ArrowUp', { ctrl: true, shift: true });
    t.key('ArrowUp', { ctrl: true, shift: true });
    expect(t.order()).toEqual(['two', 'three', 'one', 'four']);
    expect(t.picked()).toEqual([t.ids[1], t.ids[2]]);

    act(() => t.editor.store.undo());
    expect(t.order()).toEqual(['one', 'two', 'three', 'four']);
  });

  it('Ctrl+Shift+arrows with the caret move the current block', () => {
    const t = mount(['one', 'two', 'three']);

    t.caret(t.ids[0], 1);
    t.key('ArrowDown', { ctrl: true, shift: true });

    expect(t.order()).toEqual(['two', 'one', 'three']);
  });

  it('copy puts the whole blocks on the clipboard and cut removes them', () => {
    const t = mount(['one', 'two', 'three']);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    t.key('ArrowDown', { shift: true });

    const copied = t.clipboard('copy');

    expect(copied['text/plain']).toBe('one\ntwo');
    expect(JSON.parse(copied[FRAGMENT_MIME]).blocks).toHaveLength(2);
    expect(t.order()).toEqual(['one', 'two', 'three']);

    t.clipboard('cut');
    expect(t.order()).toEqual(['three']);
  });
});

describe('dragging and the menu act on the whole picked run', () => {
  it('moves the run when one of its blocks is dragged (before and after the target)', async () => {
    const t = mount(['one', 'two', 'three', 'four']);
    const { getBlockDrag } = await import('../src/block-handle/blockDrag');
    const drag = getBlockDrag(t.editor, captured!);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    t.key('ArrowDown', { shift: true });
    t.editor.clearHistory();

    expect(drag.canMove(t.ids[0], t.ids[1], 'after')).toBe(false);
    expect(drag.canMove(t.ids[0], t.ids[3], 'after')).toBe(true);

    act(() => void drag.move(t.ids[0], t.ids[3], 'after'));
    expect(t.order()).toEqual(['three', 'four', 'one', 'two']);

    act(() => void drag.move(t.ids[1], t.ids[2], 'before'));
    expect(t.order()).toEqual(['one', 'two', 'three', 'four']);

    act(() => t.editor.store.undo());
    expect(t.order()).toEqual(['three', 'four', 'one', 'two']);
  });

  it('the block menu deletes and duplicates the run when opened on one of its blocks', () => {
    const t = mount(['one', 'two', 'three']);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    t.key('ArrowDown', { shift: true });

    act(() => captured!.blocks.openMenu({ blockId: t.ids[1], x: 10, y: 10 }));

    const menu = document.querySelector('[data-testid="block-menu"]')!;

    act(() => (menu.querySelector('[data-action="duplicate"]') as HTMLElement).click());
    expect(t.order()).toEqual(['one', 'two', 'one', 'two', 'three']);

    act(() => captured!.blocks.openMenu({ blockId: t.picked()[0], x: 10, y: 10 }));
    act(() =>
      (
        document.querySelector('[data-testid="block-menu"] [data-action="delete"]') as HTMLElement
      ).click(),
    );
    expect(t.order()).toEqual(['one', 'two', 'three']);
  });
});

describe('what Escape leaves alone', () => {
  it('does nothing without a caret, in the slash menu and while a find or palette panel is open', () => {
    const t = mount(['one']);

    getSelection()!.removeAllRanges();
    expect(t.key('Escape').defaultPrevented).toBe(false);

    t.caret(t.ids[0], 0);
    act(() => captured!.slash.open(t.ids[0], 0));
    t.key('Escape');
    expect(t.picked()).toEqual([]);

    captured!.panels.add('palette');
    t.caret(t.ids[0], 0);
    t.key('Escape');
    expect(t.picked()).toEqual([]);
    captured!.panels.delete('palette');
  });
});
