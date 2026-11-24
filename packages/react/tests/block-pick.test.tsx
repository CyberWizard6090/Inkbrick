import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { FRAGMENT_MIME } from '@inkbrick/engine';
import type { EditorView } from '@inkbrick/view';

import { CommandPalette, FindReplacePanel, commandPalette, tableBlocks, useFind } from '../src';
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

function mount(
  texts: string[],
  options: Parameters<typeof mountEditor>[1] = { extra: <Capture /> },
) {
  const mounted = mountEditor(texts, options);
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

describe('turn into and background act on the whole picked run', () => {
  const flavours = (t: ReturnType<typeof mount>) =>
    t.blocks().map((id) => t.editor.document.getBlock(id)!.flavour.replace('block:', ''));
  const backgrounds = (t: ReturnType<typeof mount>) =>
    t.blocks().map((id) => t.editor.document.getBlock(id)!.props.background);
  const openMenu = (t: ReturnType<typeof mount>, blockId: string) =>
    act(() => captured!.blocks.openMenu({ blockId, x: 10, y: 10 }));
  const menu = () => document.querySelector('[data-testid="block-menu"]')!;
  const click = (selector: string) =>
    act(() => (menu().querySelector(selector) as HTMLElement).click());

  function pickAll(t: ReturnType<typeof mount>, count: number) {
    t.caret(t.ids[0], 0);
    t.key('Escape');
    for (let i = 1; i < count; i++) t.key('ArrowDown', { shift: true });
  }

  /** Три абзаца и таблица между ними: у таблицы нет ни фона, ни превращения. */
  function withTable() {
    const t = mount(['one', 'two', 'three'], { blocks: tableBlocks, extra: <Capture /> });

    act(() => {
      t.editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'block:table', afterId: t.ids[0] },
      });
    });

    return t;
  }

  it('turns every picked block into the chosen type in one undo step and keeps the pick', () => {
    const t = mount(['one', 'two', 'three']);

    pickAll(t, 2);
    t.editor.clearHistory();
    openMenu(t, t.ids[1]);
    click('[data-action="heading-2"]');

    expect(flavours(t)).toEqual(['heading', 'heading', 'paragraph']);
    expect(t.order()).toEqual(['one', 'two', 'three']);
    expect(t.picked()).toEqual([t.ids[0], t.ids[1]]);
    expect(document.querySelector('[data-testid="block-menu"]')).toBeNull();

    act(() => t.editor.store.undo());
    expect(flavours(t)).toEqual(['paragraph', 'paragraph', 'paragraph']);
  });

  it('turns only the blocks that can be turned and hides the item when none can', () => {
    const t = withTable();

    pickAll(t, 3);
    openMenu(t, t.ids[0]);
    click('[data-action="quote"]');

    expect(flavours(t)).toEqual(['quote', 'table', 'quote', 'paragraph']);

    // Таблица одна в ряду: превращать некуда, пункта нет.
    act(() => captured!.picked.set([t.blocks()[1]], t.blocks()[1], t.blocks()[1]));
    act(() => captured!.blocks.closeMenu());
    openMenu(t, t.blocks()[1]);
    expect(menu().querySelector('[data-action="heading-1"]')).toBeNull();
  });

  it('does not offer a type without text for a run, only for one block', () => {
    const t = mount(['one', 'two']);

    pickAll(t, 2);
    openMenu(t, t.ids[0]);
    expect(menu().querySelector('[data-action="heading-1"]')).not.toBeNull();
    expect(menu().querySelector('[data-action="divider"]')).toBeNull();
    act(() => captured!.blocks.closeMenu());

    act(() => captured!.picked.set([t.ids[0]], t.ids[0], t.ids[0]));
    openMenu(t, t.ids[0]);
    expect(menu().querySelector('[data-action="divider"]')).not.toBeNull();
  });

  it('sets and clears the background of the whole run in one undo step', () => {
    const t = mount(['one', 'two', 'three']);

    pickAll(t, 3);
    t.editor.clearHistory();
    openMenu(t, t.ids[2]);
    click('[data-action="background-yellow"]');

    expect(backgrounds(t)).toEqual(['yellow', 'yellow', 'yellow']);
    expect(t.picked()).toEqual(t.ids);

    openMenu(t, t.ids[0]);
    expect(
      menu().querySelector('[data-action="background-yellow"]')!.getAttribute('aria-checked'),
    ).toBe('true');
    click('[data-action="background-none"]');
    expect(backgrounds(t)).toEqual([undefined, undefined, undefined]);

    act(() => t.editor.store.undo());
    expect(backgrounds(t)).toEqual(['yellow', 'yellow', 'yellow']);
    act(() => t.editor.store.undo());
    expect(backgrounds(t)).toEqual([undefined, undefined, undefined]);
  });

  it('skips blocks without a background, and has no row when none has one', () => {
    const t = withTable();

    pickAll(t, 3);
    openMenu(t, t.ids[0]);
    click('[data-action="background-blue"]');

    expect(backgrounds(t)).toEqual(['blue', undefined, 'blue', undefined]);

    act(() => captured!.picked.set([t.blocks()[1]], t.blocks()[1], t.blocks()[1]));
    openMenu(t, t.blocks()[1]);
    expect(menu().querySelector('[data-inkbrick-part="swatches"]')).toBeNull();
  });

  it('the menu of a block outside the pick still acts on that block alone', () => {
    const t = mount(['one', 'two', 'three']);

    pickAll(t, 2);
    openMenu(t, t.ids[2]);
    click('[data-action="background-red"]');

    expect(backgrounds(t)).toEqual([undefined, undefined, 'red']);
  });

  it('the command palette turns the whole picked run into a type', () => {
    const t = mount(['one', 'two', 'three'], {
      keymap: commandPalette.keymap,
      extra: (
        <>
          <Capture />
          <CommandPalette />
        </>
      ),
    });

    pickAll(t, 2);
    t.editor.clearHistory();
    t.key('p', { ctrl: true, shift: true });

    const option = document.querySelector<HTMLElement>('[data-command="turn.quote"]')!;

    expect(option).not.toBeNull();
    act(() => fireEvent.click(option));

    expect(flavours(t)).toEqual(['quote', 'quote', 'paragraph']);

    act(() => t.editor.store.undo());
    expect(flavours(t)).toEqual(['paragraph', 'paragraph', 'paragraph']);
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
