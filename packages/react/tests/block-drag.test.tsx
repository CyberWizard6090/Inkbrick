import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react';

import type { BlockId } from '@inkbrick/document';
import { Editor, type CaretResult } from '@inkbrick/engine';

import {
  DocumentView,
  EditorProvider,
  useBlockDrag,
  useBlockDragState,
  useEditorView,
  type BlockDragApi,
  type BlockHandleProps,
  type DropIndicatorProps,
  type EditorSlots,
  type EditorView,
} from '../src';
import { LONG_PRESS_MS } from '../src/block-handle/gripGesture';

const TOP = 100;
const ROW = 20;
const LEFT = 100;
const RIGHT = 500;

function setup(texts: string[]) {
  const editor = new Editor();
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const ids: BlockId[] = [editor.document.getBlock(noteId)!.children[0]];

  for (let i = 1; i < texts.length; i++) {
    const result = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:paragraph', afterId: ids[i - 1] },
    }) as CaretResult;

    ids.push(result.blockId);
  }

  texts.forEach((text, i) =>
    editor.dispatch({ type: 'replaceText', payload: { blockId: ids[i], from: 0, to: 0, text } }),
  );
  editor.clearHistory();

  const order = () =>
    editor.document
      .getBlock(noteId)!
      .children.map((id) =>
        editor.engine.inline.toPlainText(editor.document.getBlock(id)!.content),
      );

  return { editor, ids, order };
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

/**
 * jsdom не считает раскладку: блоки верхнего уровня заметки стоят друг под другом по ROW пикселей,
 * а elementFromPoint возвращает обёртку блока в этой строке.
 */
function fakeLayout(order: () => BlockId[]) {
  const original = HTMLElement.prototype.getBoundingClientRect;

  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const ids = order();

    if (this.hasAttribute('data-inkbrick-root'))
      return rect(LEFT, TOP, RIGHT - LEFT, ids.length * ROW);

    const id = this.closest('[data-block-id]')?.getAttribute('data-block-id');
    const index = id ? ids.indexOf(id) : -1;

    return index >= 0 ? rect(LEFT, TOP + index * ROW, RIGHT - LEFT, ROW) : original.call(this);
  };

  document.elementFromPoint = (x: number, y: number) => {
    const ids = order();
    const index = Math.floor((y - TOP) / ROW);

    if (x < LEFT || x > RIGHT || index < 0 || index >= ids.length) return null;

    return document.querySelector(`[data-block-id="${ids[index]}"]`);
  };

  return () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

const half = (index: number, which: 'top' | 'bottom') =>
  TOP + index * ROW + (which === 'top' ? 4 : ROW - 4);

function mount(texts: string[], slots: EditorSlots = {}) {
  const doc = setup(texts);
  const noteChildren = () => doc.editor.document.getBlock(doc.ids[0])!.parentId!;
  const restore = fakeLayout(() => doc.editor.document.getBlock(noteChildren())!.children);
  const captured: { drag?: BlockDragApi; view?: EditorView } = {};

  const Probe = () => {
    captured.drag = useBlockDrag();
    captured.view = useEditorView();
    return null;
  };

  const utils = render(
    <EditorProvider editor={doc.editor} slots={slots}>
      <Probe />
      <DocumentView />
    </EditorProvider>,
  );

  return { ...doc, ...utils, restore, drag: captured.drag!, view: captured.view! };
}

let cleanupLayout: (() => void) | undefined;

beforeEach(() => {
  if (typeof CSS === 'undefined' || !CSS.escape) {
    (globalThis as { CSS?: unknown }).CSS = { escape: (value: string) => value };
  }
});

afterEach(() => {
  cleanupLayout?.();
  cleanupLayout = undefined;
  vi.useRealTimers();
});

const indicator = () => document.querySelector('[data-testid="drop-indicator"]');

describe('useBlockDrag: geometry and targets', () => {
  it('finds the block under a point, also from the gutter left of the text', () => {
    const t = mount(['one', 'two', 'three']);
    cleanupLayout = t.restore;

    expect(t.drag.blockAtPoint(LEFT + 10, half(1, 'top'))).toBe(t.ids[1]);
    expect(t.drag.blockAtPoint(LEFT - 30, half(2, 'top'))).toBe(t.ids[2]);
    expect(t.drag.blockAtPoint(LEFT + 10, TOP - 30)).toBeNull();
    expect(t.drag.blockRects(t.ids[1])?.row.top).toBe(TOP + ROW);
  });

  it('upper half drops before, lower half after; itself and invalid targets give nothing', () => {
    const t = mount(['one', 'two', 'three']);
    cleanupLayout = t.restore;

    expect(t.drag.dropTargetAt(t.ids[0], LEFT + 10, half(2, 'top'))).toMatchObject({
      targetId: t.ids[2],
      position: 'before',
      indicator: { top: TOP + 2 * ROW - 1, left: LEFT, width: RIGHT - LEFT },
    });
    expect(t.drag.dropTargetAt(t.ids[0], LEFT + 10, half(2, 'bottom'))).toMatchObject({
      targetId: t.ids[2],
      position: 'after',
      indicator: { top: TOP + 3 * ROW + 1 },
    });
    expect(t.drag.dropTargetAt(t.ids[1], LEFT + 10, half(1, 'top'))).toBeNull();
    expect(t.drag.canMove(t.ids[0], t.ids[0], 'after')).toBe(false);
    expect(t.drag.canMove(t.ids[0], 'nope', 'after')).toBe(false);
  });

  it('is the same object across renders', () => {
    const t = mount(['one']);
    cleanupLayout = t.restore;
    const seen: BlockDragApi[] = [];
    const Probe = () => {
      seen.push(useBlockDrag());
      return null;
    };

    t.rerender(
      <EditorProvider editor={t.editor}>
        <Probe />
      </EditorProvider>,
    );

    expect(seen[0]).toBeDefined();
    expect(seen.every((api) => api === seen[0])).toBe(true);
  });
});

describe('useBlockDrag: a custom drag and drop', () => {
  it('start → update → drop moves the block in one undo step and draws the drop line', () => {
    const t = mount(['one', 'two', 'three', 'four']);
    cleanupLayout = t.restore;

    act(() => t.drag.start(t.ids[0]));
    expect(document.body.hasAttribute('data-inkbrick-dragging')).toBe(true);
    expect(document.querySelector(`[data-block-id="${t.ids[0]}"]`)).toHaveProperty(
      'dataset.inkbrickDragging',
      'true',
    );

    act(() => {
      t.drag.update(LEFT + 10, half(2, 'bottom'));
    });
    expect(indicator()?.getAttribute('data-position')).toBe('after');

    let moved = false;
    act(() => {
      moved = t.drag.drop();
    });

    expect(moved).toBe(true);
    expect(t.order()).toEqual(['two', 'three', 'one', 'four']);
    expect(indicator()).toBeNull();
    expect(document.body.hasAttribute('data-inkbrick-dragging')).toBe(false);
    expect(t.drag.getState()).toBeNull();

    act(() => t.editor.undo());
    expect(t.order()).toEqual(['one', 'two', 'three', 'four']);
  });

  it('cancel and a drop without a target change nothing', () => {
    const t = mount(['one', 'two', 'three']);
    cleanupLayout = t.restore;

    act(() => {
      t.drag.start(t.ids[0]);
      t.drag.update(LEFT + 10, half(2, 'bottom'));
      t.drag.cancel();
    });
    expect(t.order()).toEqual(['one', 'two', 'three']);
    expect(indicator()).toBeNull();

    let moved = true;
    act(() => {
      t.drag.start(t.ids[0]);
      t.drag.update(LEFT + 10, TOP - 40); // мимо документа
      moved = t.drag.drop();
    });
    expect(moved).toBe(false);
    expect(t.order()).toEqual(['one', 'two', 'three']);
  });

  it('setTarget drops targets the engine would reject', () => {
    const t = mount(['one', 'two']);
    cleanupLayout = t.restore;

    act(() => {
      t.drag.start(t.ids[0]);
      t.drag.setTarget({
        targetId: t.ids[0],
        position: 'after',
        indicator: { left: 0, top: 0, width: 10 },
      });
    });

    expect(t.drag.getState()).toMatchObject({ targetId: null, indicator: null });
    act(() => t.drag.cancel());
  });

  it('move() applies a transfer directly and reports invalid ones', () => {
    const t = mount(['one', 'two', 'three']);
    cleanupLayout = t.restore;

    act(() => {
      expect(t.drag.move(t.ids[2], t.ids[0], 'before')).toBe(true);
    });
    expect(t.order()).toEqual(['three', 'one', 'two']);
    expect(t.drag.move(t.ids[2], t.ids[2], 'before')).toBe(false);
  });

  it('works without block handles and with a custom drop line', () => {
    const Line = ({ position, targetId }: DropIndicatorProps) => (
      <i data-testid="my-line" data-position={position} data-target={targetId} />
    );
    const t = mount(['one', 'two'], { BlockHandle: null, DropIndicator: Line });
    cleanupLayout = t.restore;

    act(() => {
      t.drag.start(t.ids[1]);
      t.drag.update(LEFT + 10, half(0, 'top'));
    });

    const line = document.querySelector('[data-testid="my-line"]');
    expect(line?.getAttribute('data-position')).toBe('before');
    expect(line?.getAttribute('data-target')).toBe(t.ids[0]);
    expect(indicator()).toBeNull();

    act(() => {
      t.drag.drop();
    });
    expect(t.order()).toEqual(['two', 'one']);
  });

  it('useBlockDragState follows the drag', () => {
    const t = mount(['one', 'two']);
    cleanupLayout = t.restore;
    const states: Array<string | null> = [];
    const Watch = () => {
      states.push(useBlockDragState()?.blockId ?? null);
      return null;
    };

    t.rerender(
      <EditorProvider editor={t.editor}>
        <Watch />
      </EditorProvider>,
    );

    act(() => t.drag.start(t.ids[1]));
    act(() => t.drag.cancel());

    expect(states.at(-1)).toBeNull();
    expect(states).toContain(t.ids[1]);
  });
});

describe('built-in grip gesture', () => {
  const grip = () => document.querySelector<HTMLElement>('[data-action="grip"]')!;
  const menu = () => document.querySelector('[data-testid="block-menu"]');

  const showHandle = (t: ReturnType<typeof mount>, index: number) => {
    act(() => t.view.blocks.setHover({ blockId: t.ids[index], x: LEFT, y: TOP + index * ROW }));
    expect(grip()).not.toBeNull();
  };

  const pointer = (type: 'mouse' | 'touch', x: number, y: number) => ({
    pointerId: type === 'touch' ? 7 : 1,
    pointerType: type,
    button: 0,
    clientX: x,
    clientY: y,
    bubbles: true,
  });

  it('the grip blocks page scroll under the finger and the system menu', () => {
    const t = mount(['one']);
    cleanupLayout = t.restore;
    showHandle(t, 0);

    expect(grip().style.touchAction).toBe('none');
    expect(grip().hasAttribute('data-inkbrick-grip')).toBe(true);
    expect(fireEvent.contextMenu(grip())).toBe(false);
  });

  it('mouse: dragging past the threshold moves the block, a click opens the menu', () => {
    const t = mount(['one', 'two', 'three']);
    cleanupLayout = t.restore;
    showHandle(t, 0);

    fireEvent.pointerDown(grip(), pointer('mouse', 80, half(0, 'top')));
    fireEvent.pointerMove(document, pointer('mouse', 82, half(0, 'top')));
    expect(t.drag.getState()).toBeNull(); // меньше порога

    act(() => {
      fireEvent.pointerMove(document, pointer('mouse', LEFT + 10, half(2, 'bottom')));
    });
    expect(indicator()).not.toBeNull();

    act(() => {
      fireEvent.pointerUp(document, pointer('mouse', LEFT + 10, half(2, 'bottom')));
    });
    expect(t.order()).toEqual(['two', 'three', 'one']);

    showHandle(t, 1);
    fireEvent.pointerDown(grip(), pointer('mouse', 80, half(1, 'top')));
    act(() => {
      fireEvent.pointerUp(document, pointer('mouse', 80, half(1, 'top')));
    });
    expect(menu()).not.toBeNull();
    expect(t.order()).toEqual(['two', 'three', 'one']);
  });

  it('touch: a long press picks the block up, then the finger moves it', () => {
    vi.useFakeTimers();
    const t = mount(['one', 'two', 'three']);
    cleanupLayout = t.restore;
    showHandle(t, 0);

    fireEvent.pointerDown(grip(), pointer('touch', 80, half(0, 'top')));
    expect(t.drag.getState()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
    expect(t.drag.getState()?.blockId).toBe(t.ids[0]);
    expect(menu()).toBeNull();

    act(() => {
      fireEvent.pointerMove(document, pointer('touch', LEFT + 10, half(2, 'bottom')));
    });
    expect(indicator()?.getAttribute('data-position')).toBe('after');

    act(() => {
      fireEvent.pointerUp(document, pointer('touch', LEFT + 10, half(2, 'bottom')));
    });
    expect(t.order()).toEqual(['two', 'three', 'one']);
    expect(t.drag.getState()).toBeNull();
  });

  it('touch: a short tap opens the menu; moving before the long press does nothing', () => {
    vi.useFakeTimers();
    const t = mount(['one', 'two', 'three']);
    cleanupLayout = t.restore;
    showHandle(t, 1);

    fireEvent.pointerDown(grip(), pointer('touch', 80, half(1, 'top')));
    act(() => {
      vi.advanceTimersByTime(100);
      fireEvent.pointerUp(document, pointer('touch', 80, half(1, 'top')));
    });
    expect(menu()).not.toBeNull();

    act(() => t.view.blocks.closeMenu());
    showHandle(t, 1);

    fireEvent.pointerDown(grip(), pointer('touch', 80, half(1, 'top')));
    fireEvent.pointerMove(document, pointer('touch', 80, half(1, 'top') + 40));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      fireEvent.pointerUp(document, pointer('touch', 80, half(1, 'top') + 40));
    });

    expect(t.drag.getState()).toBeNull();
    expect(menu()).toBeNull();
    expect(t.order()).toEqual(['one', 'two', 'three']);
  });

  it('touch: pointercancel during a drag cancels it', () => {
    vi.useFakeTimers();
    const t = mount(['one', 'two']);
    cleanupLayout = t.restore;
    showHandle(t, 0);

    fireEvent.pointerDown(grip(), pointer('touch', 80, half(0, 'top')));
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      fireEvent.pointerMove(document, pointer('touch', LEFT + 10, half(1, 'bottom')));
      fireEvent.pointerCancel(document, pointer('touch', LEFT + 10, half(1, 'bottom')));
    });

    expect(t.drag.getState()).toBeNull();
    expect(t.order()).toEqual(['one', 'two']);
  });
});

describe('a custom handle built only on the public API', () => {
  function SimpleHandle({ blockId, position, onOpenMenu }: BlockHandleProps) {
    const drag = useBlockDrag();
    const start = useRef<{ x: number; y: number } | null>(null);

    return (
      <div
        data-inkbrick-block-ui
        style={{ position: 'fixed', left: position.x - 28, top: position.y }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <button
          type="button"
          data-testid="my-grip"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            start.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            const from = start.current;

            if (!from) return;
            if (!drag.getState() && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 5)
              drag.start(blockId);
            if (drag.getState()) drag.update(event.clientX, event.clientY);
          }}
          onPointerUp={() => {
            start.current = null;
            if (drag.getState()) drag.drop();
            else onOpenMenu();
          }}
          onPointerCancel={() => {
            start.current = null;
            drag.cancel();
          }}
        >
          ⋮⋮
        </button>
      </div>
    );
  }

  const at = (x: number, y: number) => ({
    pointerId: 1,
    pointerType: 'touch',
    clientX: x,
    clientY: y,
  });

  it('moves blocks through the slot without the built-in gesture; a tap opens the menu', () => {
    const t = mount(['one', 'two', 'three'], { BlockHandle: SimpleHandle });
    cleanupLayout = t.restore;

    act(() => t.view.blocks.setHover({ blockId: t.ids[2], x: LEFT, y: TOP + 2 * ROW }));
    const button = () => document.querySelector<HTMLElement>('[data-testid="my-grip"]')!;

    fireEvent.pointerDown(button(), at(80, half(2, 'top')));
    act(() => {
      fireEvent.pointerMove(button(), at(LEFT + 10, half(0, 'top')));
    });
    expect(indicator()?.getAttribute('data-position')).toBe('before');

    act(() => {
      fireEvent.pointerUp(button(), at(LEFT + 10, half(0, 'top')));
    });
    expect(t.order()).toEqual(['three', 'one', 'two']);
    expect(t.drag.getState()).toBeNull();

    act(() => t.view.blocks.setHover({ blockId: t.ids[1], x: LEFT, y: TOP + 2 * ROW }));
    fireEvent.pointerDown(button(), at(80, half(2, 'top')));
    act(() => {
      fireEvent.pointerUp(button(), at(80, half(2, 'top')));
    });
    expect(document.querySelector('[data-testid="block-menu"]')).not.toBeNull();
    expect(t.order()).toEqual(['three', 'one', 'two']);
  });
});
