import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/react';

import { isMarginTarget, pointAt } from '../src/editing/useMarginClick';
import { mountEditor } from './harness';

const LEFT = 100;
const RIGHT = 500;
const TOP = 100;
const ROW = 20;

const rect = (left: number, top: number, width: number, height: number) =>
  new DOMRect(left, top, width, height);

type CaretDoc = Omit<Document, 'caretPositionFromPoint' | 'caretRangeFromPoint'> & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

const original = HTMLElement.prototype.getBoundingClientRect;
const doc = document as unknown as CaretDoc;

/**
 * jsdom не считает раскладку: текстовые блоки стоят друг под другом по ROW пикселей, текст начинается с LEFT.
 * Точка в строке переводится в смещение по 10px на символ.
 */
function fakeLayout() {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.hasAttribute('data-inkbrick-root'))
      return rect(LEFT - 56, TOP, RIGHT - LEFT + 56, 200);

    if (this.matches('.editable[data-id]')) {
      const all = [...document.querySelectorAll('.editable[data-id]')];

      return rect(LEFT, TOP + all.indexOf(this) * ROW, RIGHT - LEFT, ROW);
    }

    return rect(0, 0, 0, 0);
  };

  doc.caretPositionFromPoint = (x, y) => {
    const all = [...document.querySelectorAll<HTMLElement>('.editable[data-id]')];
    const element = all[Math.floor((y - TOP) / ROW)];
    const text = element?.firstChild;

    if (!text) return null;

    return {
      offsetNode: text,
      offset: Math.min(text.textContent!.length, Math.round((x - LEFT) / 10)),
    };
  };
}

beforeEach(fakeLayout);

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = original;
  delete doc.caretPositionFromPoint;
  delete doc.caretRangeFromPoint;
  cleanup();
});

const caretText = () => {
  const selection = getSelection()!;

  return [selection.anchorNode?.textContent, selection.anchorOffset, selection.focusOffset];
};

describe('click beside the text', () => {
  it('left of a line puts the caret at its start, right of it at its end', () => {
    const { root } = mountEditor(['one', 'two']);

    fireEvent.mouseDown(root, { button: 0, clientX: LEFT - 30, clientY: TOP + ROW + 5 });
    expect(caretText()).toEqual(['two', 0, 0]);
    expect(document.activeElement).toBe(root);

    fireEvent.mouseUp(document);
    fireEvent.mouseDown(root, { button: 0, clientX: RIGHT + 20, clientY: TOP + 5 });
    expect(caretText()).toEqual(['one', 3, 3]);
  });

  it('below the last block goes to its end, above the first to its first line', () => {
    const { root } = mountEditor(['one', 'two']);

    fireEvent.mouseDown(root, { button: 0, clientX: LEFT - 30, clientY: TOP + 150 });
    expect(caretText()).toEqual(['two', 3, 3]);

    fireEvent.mouseDown(root, { button: 0, clientX: LEFT - 30, clientY: TOP - 30 });
    expect(caretText()).toEqual(['one', 0, 0]);
  });

  it('dragging extends the selection; Shift+click extends the current one', () => {
    const { root } = mountEditor(['one', 'two', 'three']);

    fireEvent.mouseDown(root, { button: 0, clientX: LEFT - 30, clientY: TOP + 5 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: RIGHT + 20, clientY: TOP + ROW + 5 });

    const selection = getSelection()!;

    expect(selection.anchorNode?.textContent).toBe('one');
    expect(selection.focusNode?.textContent).toBe('two');
    expect(selection.focusOffset).toBe(3);

    // Кнопку отпустили за пределами окна: следующее движение заканчивает протягивание.
    fireEvent.mouseMove(document, { buttons: 0, clientX: RIGHT + 20, clientY: TOP + 2 * ROW + 5 });
    expect(getSelection()!.focusNode?.textContent).toBe('two');

    fireEvent.mouseDown(root, {
      button: 0,
      shiftKey: true,
      clientX: RIGHT + 20,
      clientY: TOP + 2 * ROW + 5,
    });
    expect(getSelection()!.anchorNode?.textContent).toBe('one');
    expect(getSelection()!.focusNode?.textContent).toBe('three');
  });

  it('falls back to caretRangeFromPoint and to the side of the line', () => {
    const { root } = mountEditor(['one']);

    delete doc.caretPositionFromPoint;
    doc.caretRangeFromPoint = (x) => {
      const range = document.createRange();
      const text = document.querySelector('.editable[data-id]')!.firstChild!;

      range.setStart(text, x > LEFT + 15 ? 2 : 1);
      return range;
    };

    fireEvent.mouseDown(root, { button: 0, clientX: RIGHT + 20, clientY: TOP + 5 });
    expect(caretText()).toEqual(['one', 2, 2]);

    // Без API точки у браузера: левее середины — начало, правее — конец.
    delete doc.caretRangeFromPoint;
    fireEvent.mouseDown(root, { button: 0, clientX: LEFT - 30, clientY: TOP + 5 });
    expect(caretText()).toEqual(['one', 0, 0]);
    fireEvent.mouseDown(root, { button: 0, clientX: RIGHT + 20, clientY: TOP + 5 });
    expect(caretText()).toEqual(['one', 3, 3]);
  });

  it('ignores other buttons, prevented events and read-only documents', () => {
    const { root, ids, caret } = mountEditor(['one']);

    caret(ids[0], 2);
    fireEvent.mouseDown(root, { button: 2, clientX: LEFT - 30, clientY: TOP + 5 });
    expect(caretText()).toEqual(['one', 2, 2]);

    const prevented = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: LEFT - 30,
      clientY: TOP + 5,
    });

    prevented.preventDefault();
    root.dispatchEvent(prevented);
    expect(caretText()).toEqual(['one', 2, 2]);

    cleanup();
    fakeLayout();

    const readOnly = mountEditor(['one'], { readOnly: true });

    expect(
      fireEvent.mouseDown(readOnly.root, { button: 0, clientX: LEFT - 30, clientY: TOP + 5 }),
    ).toBe(true);
  });
});

describe('isMarginTarget and pointAt', () => {
  it('only wrappers of the editor and empty space inside it count as margin', () => {
    const { root, editable, ids } = mountEditor(['one']);
    const wrapper = root.parentElement!;
    const sibling = document.createElement('p');
    const button = document.createElement('button');

    document.body.append(sibling);
    root.append(button);

    expect(isMarginTarget(root, root)).toBe(true);
    expect(isMarginTarget(root, wrapper)).toBe(true);
    expect(isMarginTarget(root, editable(ids[0]))).toBe(false);
    expect(isMarginTarget(root, sibling)).toBe(false);
    expect(isMarginTarget(root, button)).toBe(false);
  });

  it('gives nothing in a document without text blocks', () => {
    const root = document.createElement('div');

    expect(pointAt(root, 10, 10)).toBeNull();
  });

  it('the buffer zone is the closest data-inkbrick-surface ancestor', () => {
    const surface = document.createElement('main');

    surface.setAttribute('data-inkbrick-surface', '');
    document.body.append(surface);

    const { root } = mountEditor(['one'], {}, surface);

    fireEvent.mouseDown(surface, { button: 0, clientX: 10, clientY: TOP + 5 });
    expect(caretText()).toEqual(['one', 0, 0]);
    expect(document.activeElement).toBe(root);

    surface.remove();
  });
});
