import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { FRAGMENT_MIME } from '@inkbrick/engine';

import type { EditorView } from '../src/editing/EditorView';
import { useEditorView } from '../src/hooks/useEditorView';
import { pickRangeTo, togglePick } from '../src/pick/actions';
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

  return { ...mounted, picked, order, marks };
}

const ctrlA = { ctrl: true } as const;

describe('Ctrl+A picks the text, then the blocks', () => {
  it('selects the text of the block first, then every block', () => {
    const t = mount(['one', 'two', 'three']);

    t.caret(t.ids[1], 1);
    t.key('a', ctrlA);

    expect(t.picked()).toEqual([]);
    expect(getSelection()!.toString()).toBe('two');

    t.key('a', ctrlA);
    expect(t.picked()).toEqual(t.ids);
    expect(t.marks()).toEqual([true, true, true]);

    // Всё уже выбрано, выше уровня нет: ничего не меняется.
    t.key('a', ctrlA);
    expect(t.picked()).toEqual(t.ids);
  });

  it('picks every block at once from an empty block, and Delete leaves one empty paragraph', () => {
    const t = mount(['one', '', 'three']);

    t.caret(t.ids[1], 0);
    t.key('a', ctrlA);
    expect(t.picked()).toEqual(t.ids);

    t.key('Delete');
    expect(t.order()).toEqual(['']);
  });

  it('copies every block once they are all picked', () => {
    const t = mount(['one', 'two']);

    t.caret(t.ids[0], 0);
    t.key('a', ctrlA);
    t.key('a', ctrlA);

    const fragment = JSON.parse(t.clipboard('copy')[FRAGMENT_MIME]) as { blocks: unknown[] };

    expect(fragment.blocks).toHaveLength(2);
  });
});

describe('picking blocks one by one and by range', () => {
  it('Ctrl/Cmd+click on the handle adds and removes single blocks, even apart', () => {
    const t = mount(['one', 'two', 'three', 'four']);

    t.caret(t.ids[0], 0);
    t.key('Escape');

    act(() => void togglePick(t.editor, captured!, t.ids[2]));
    expect(t.picked()).toEqual([t.ids[0], t.ids[2]]);
    expect(t.marks()).toEqual([true, false, true, false]);

    act(() => void togglePick(t.editor, captured!, t.ids[3]));
    expect(t.picked()).toEqual([t.ids[0], t.ids[2], t.ids[3]]);

    act(() => void togglePick(t.editor, captured!, t.ids[0]));
    expect(t.picked()).toEqual([t.ids[2], t.ids[3]]);
    expect(captured!.picked.getState().focus).toBe(t.ids[3]);
    expect(t.marks()).toEqual([false, false, true, true]);

    act(() => void togglePick(t.editor, captured!, t.ids[2]));
    act(() => void togglePick(t.editor, captured!, t.ids[3]));
    expect(t.picked()).toEqual([]);
  });

  it('Shift+click on a block extends the pick to it without placing a caret', () => {
    const t = mount(['one', 'two', 'three', 'four']);

    t.caret(t.ids[1], 0);
    t.key('Escape');

    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      button: 0,
    });

    act(() => void t.editable(t.ids[3]).dispatchEvent(down));

    expect(down.defaultPrevented).toBe(true);
    expect(t.picked()).toEqual([t.ids[1], t.ids[2], t.ids[3]]);

    act(() => void pickRangeTo(t.editor, captured!, t.ids[0]));
    expect(t.picked()).toEqual([t.ids[0], t.ids[1]]);
  });

  it('a range from the caret block picks the blocks between', () => {
    const t = mount(['one', 'two', 'three']);

    t.caret(t.ids[0], 0);
    act(() => void pickRangeTo(t.editor, captured!, t.ids[2], t.ids[0]));
    expect(t.picked()).toEqual(t.ids);
  });

  it('a click outside the pick, in the document or on the page, drops it; a Shift+click does not', () => {
    const t = mount(['one', 'two']);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    act(() => void document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(t.picked()).toEqual([]);

    t.caret(t.ids[0], 0);
    t.key('Escape');

    const shift = new Event('pointerdown', { bubbles: true });

    Object.assign(shift, { shiftKey: true, button: 0 });
    act(() => void t.editable(t.ids[1]).dispatchEvent(shift));
    expect(t.picked()).toEqual([t.ids[0]]);

    act(() => void t.editable(t.ids[1]).dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(t.picked()).toEqual([]);
  });

  it('Shift+arrows keep loose blocks of a scattered pick and shrink back by the focus', () => {
    const t = mount(['a', 'b', 'c', 'd', 'e']);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    act(() => void togglePick(t.editor, captured!, t.ids[2]));

    t.key('ArrowDown', { shift: true });
    expect(t.picked()).toEqual([t.ids[0], t.ids[2], t.ids[3]]);

    t.key('ArrowUp', { shift: true });
    expect(t.picked()).toEqual([t.ids[0], t.ids[2]]);
  });

  it('a scattered pick is copied, moved and deleted block by block, each in one undo step', () => {
    const t = mount(['a', 'b', 'c', 'd', 'e']);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    act(() => void togglePick(t.editor, captured!, t.ids[2]));
    t.editor.clearHistory();

    const fragment = JSON.parse(t.clipboard('copy')[FRAGMENT_MIME]) as {
      blocks: { content: { insert: string }[] }[];
    };

    expect(fragment.blocks.map((block) => block.content[0].insert)).toEqual(['a', 'c']);

    t.key('ArrowDown', { ctrl: true, shift: true });
    expect(t.order()).toEqual(['b', 'a', 'd', 'c', 'e']);
    t.key('ArrowDown', { ctrl: true, shift: true });
    expect(t.order()).toEqual(['b', 'd', 'a', 'e', 'c']);
    t.key('ArrowDown', { ctrl: true, shift: true });
    expect(t.order()).toEqual(['b', 'd', 'e', 'a', 'c']);

    act(() => t.editor.store.undo());
    expect(t.order()).toEqual(['b', 'd', 'a', 'e', 'c']);
    t.key('ArrowUp', { ctrl: true, shift: true });
    expect(t.order()).toEqual(['b', 'a', 'd', 'c', 'e']);

    t.editor.clearHistory();
    t.key('Delete');
    expect(t.order()).toEqual(['b', 'd', 'e']);
    act(() => t.editor.store.undo());
    expect(t.order()).toEqual(['b', 'a', 'd', 'c', 'e']);
  });
});

describe('the cost of changing the pick', () => {
  it('extending does not look blocks up one by one: DOM lookups do not grow with the document', () => {
    const lookups = (count: number) => {
      const t = mount(Array.from({ length: count }, (_, i) => `block ${i}`));
      const one = vi.spyOn(Element.prototype, 'querySelector');
      const all = vi.spyOn(Element.prototype, 'querySelectorAll');

      t.caret(t.ids[0], 0);
      t.key('Escape');
      one.mockClear();
      all.mockClear();

      for (let i = 0; i < 5; i++) t.key('ArrowDown', { shift: true });

      const result = { single: one.mock.calls.length, batch: all.mock.calls.length };

      one.mockRestore();
      all.mockRestore();
      cleanup();

      return result;
    };

    const small = lookups(10);
    const large = lookups(120);

    expect(large.single).toBe(small.single);
    // Один проход по нарисованным блокам на каждое изменение выбора (раньше каждый блок искал свой элемент сам).
    expect(large.batch).toBe(small.batch);
    expect(large.batch).toBeLessThanOrEqual(5);
  });

  it('blocks that did not change are not rendered again when the pick changes', () => {
    const t = mount(['one', 'two', 'three', 'four']);
    const before = t.ids.map((id) => document.querySelector(`[data-block-id="${id}"]`));
    const observer = new MutationObserver(() => {});

    observer.observe(t.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    t.caret(t.ids[0], 0);
    observer.takeRecords();
    t.key('Escape');
    t.key('ArrowDown', { shift: true });

    // Меняются только отметки выбора; блоки не пересобираются и их содержимое не трогается.
    const records = observer.takeRecords();

    observer.disconnect();
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.type === 'attributes')).toBe(true);
    expect(
      records.every((record) => ['data-picked', 'data-picking'].includes(record.attributeName!)),
    ).toBe(true);
    expect(t.ids.map((id) => document.querySelector(`[data-block-id="${id}"]`))).toEqual(before);
  });
});

describe('marquee from the margin', () => {
  const tops = new Map<string, number>();
  let frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames = [];
    tops.clear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', () => {});
    // jsdom не умеет прокручивать окно; рамка у края просит прокрутку.
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const id = this.getAttribute('data-block-id') ?? this.getAttribute('data-id');

      if (this.hasAttribute('data-inkbrick-root')) return new DOMRect(100, 0, 400, 1000);

      return id ? new DOMRect(100, tops.get(id) ?? 0, 400, 20) : new DOMRect(0, 0, 0, 0);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const flush = () => {
    const queue = frames;

    frames = [];
    act(() => queue.forEach((callback) => callback(0)));
  };

  // Рамку начинают на поле (x = 40) и ведут в текст: блоки лежат от x = 100.
  const moveTo = (y: number, x = 150) =>
    act(
      () =>
        void document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: x, clientY: y, buttons: 1 }),
        ),
    );

  const press = (t: ReturnType<typeof mount>, y: number) => {
    t.ids.forEach((id, index) => tops.set(id, index * 30));

    act(
      () =>
        void t.root.dispatchEvent(
          new MouseEvent('mousedown', {
            clientX: 40,
            clientY: y,
            button: 0,
            bubbles: true,
            cancelable: true,
          }),
        ),
    );
  };

  it('picks the blocks the frame touches as it grows, shrinks and reverses', () => {
    const t = mount(['a', 'b', 'c', 'd', 'e']);

    press(t, 5);

    moveTo(80);
    flush();
    expect(t.picked()).toEqual([t.ids[0], t.ids[1], t.ids[2]]);

    moveTo(40);
    flush();
    expect(t.picked()).toEqual([t.ids[0], t.ids[1]]);

    moveTo(5);
    flush();
    expect(t.picked()).toEqual([t.ids[0]]);
  });

  it('a frame that stays on the margin picks nothing; reaching the text picks', () => {
    const t = mount(['a', 'b', 'c']);

    press(t, 5);

    moveTo(70, 60);
    flush();
    expect(t.picked()).toEqual([]);

    moveTo(70, 101);
    flush();
    expect(t.picked()).toEqual([t.ids[0], t.ids[1], t.ids[2]]);
  });

  it('starting in a gap picks only the blocks the frame reaches', () => {
    const t = mount(['a', 'b', 'c', 'd']);

    press(t, 25);

    moveTo(100);
    flush();
    expect(t.picked()).toEqual([t.ids[1], t.ids[2], t.ids[3]]);

    moveTo(27);
    flush();
    expect(t.picked()).toEqual([]);

    moveTo(10);
    flush();
    expect(t.picked()).toEqual([t.ids[0]]);
  });

  it('updates once per frame however many mouse moves arrive, and the frame goes away on release', () => {
    const t = mount(['a', 'b', 'c']);

    press(t, 5);
    moveTo(10);
    flush();

    const changes = vi.fn();

    captured!.picked.subscribe(changes);

    for (let y = 11; y < 70; y++) moveTo(y);

    expect(frames).toHaveLength(1);
    flush();
    expect(changes).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-inkbrick-ui="marquee"]')).not.toBeNull();

    act(() => void document.dispatchEvent(new MouseEvent('mouseup')));
    expect(document.querySelector('[data-inkbrick-ui="marquee"]')).toBeNull();
    expect(t.picked()).toEqual(t.ids);
  });

  it('scrolls the page while the pointer rests at the window edge', () => {
    const t = mount(['a', 'b', 'c']);
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});

    press(t, 5);
    moveTo(300);
    flush();
    expect(scroll).not.toHaveBeenCalled();

    moveTo(window.innerHeight - 4);
    flush();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.calls[0][1]).toBeGreaterThan(0);

    // Без движения мыши следующий кадр продолжает прокрутку.
    flush();
    expect(scroll).toHaveBeenCalledTimes(2);

    moveTo(2);
    flush();
    expect(scroll.mock.calls.at(-1)![1]).toBeLessThan(0);
  });

  it('a margin click without a drag clears the pick and draws no frame', () => {
    const t = mount(['a', 'b']);

    t.caret(t.ids[0], 0);
    t.key('Escape');
    press(t, 5);

    expect(t.picked()).toEqual([]);
    // Сдвиг на пиксель — не рамка.
    moveTo(6, 41);
    flush();
    expect(document.querySelector('[data-inkbrick-ui="marquee"]')).toBeNull();
    act(() => void document.dispatchEvent(new MouseEvent('mouseup')));
  });
});
