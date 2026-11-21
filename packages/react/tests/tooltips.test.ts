import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { install } from '../src/ui/tooltipLayer';
import { installTooltips } from '../src/ui/tooltips';

const bubble = () => document.querySelector<HTMLElement>('[data-inkbrick-ui="tooltip"]');

/** Событие указателя: в jsdom нет PointerEvent, тип указателя задаётся свойством. */
function pointer(type: string, target: Element, pointerType = 'mouse', related?: Element) {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget: related ?? null });

  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

describe('tooltips', () => {
  let stop: () => void;
  let button: HTMLButtonElement;
  let other: HTMLButtonElement;
  let outside: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<div data-inkbrick-root><button title="Insert row below">+</button>' +
      '<button title="Delete" aria-label="Delete row"></button></div>' +
      '<button id="outside" title="Not ours"></button>';
    [button, other] = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-inkbrick-root] button'),
    ];
    outside = document.querySelector<HTMLButtonElement>('#outside')!;
    stop = install();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('moves the title away at once and shows the bubble after a delay', () => {
    pointer('pointerover', button);

    expect(button.hasAttribute('title')).toBe(false);
    expect(button.dataset.inkbrickTip).toBe('Insert row below');
    expect(bubble()).toBeNull();

    vi.advanceTimersByTime(500);
    vi.runOnlyPendingTimers();

    expect(bubble()?.textContent).toBe('Insert row below');
    expect(bubble()?.getAttribute('role')).toBe('tooltip');
  });

  it('keeps the accessible name: a button without one gets the tip as its label', () => {
    pointer('pointerover', other);
    vi.advanceTimersByTime(500);

    // Своё имя у кнопки было — оно не меняется.
    expect(other.getAttribute('aria-label')).toBe('Delete row');

    const empty = document.createElement('button');

    empty.title = 'Bold';
    document.querySelector('[data-inkbrick-root]')!.append(empty);
    pointer('pointerover', empty);

    expect(empty.getAttribute('aria-label')).toBe('Bold');
  });

  it('the next button right after shows at once; leaving, a press and Escape hide it', () => {
    pointer('pointerover', button);
    vi.advanceTimersByTime(500);
    vi.runOnlyPendingTimers();
    expect(bubble()).not.toBeNull();

    pointer('pointerover', other, 'mouse');
    vi.runOnlyPendingTimers();
    expect(bubble()?.textContent).toBe('Delete');

    pointer('pointerout', other, 'mouse', document.body);
    expect(bubble()).toBeNull();

    pointer('pointerover', button);
    vi.runOnlyPendingTimers();
    expect(bubble()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(bubble()).toBeNull();

    pointer('pointerover', other);
    vi.advanceTimersByTime(1000);
    vi.runOnlyPendingTimers();
    expect(bubble()).not.toBeNull();
    pointer('pointerdown', other);
    expect(bubble()).toBeNull();
  });

  it('ignores touch, buttons outside the editor and an emptied title', () => {
    pointer('pointerover', button, 'touch');
    vi.advanceTimersByTime(1000);
    expect(bubble()).toBeNull();
    expect(button.hasAttribute('title')).toBe(true);

    pointer('pointerover', outside);
    vi.advanceTimersByTime(1000);
    expect(bubble()).toBeNull();
    expect(outside.getAttribute('title')).toBe('Not ours');

    button.setAttribute('title', '');
    pointer('pointerover', button);
    vi.advanceTimersByTime(1000);
    expect(bubble()).toBeNull();
  });

  it('keyboard focus shows the tip at once, blur hides it', () => {
    const matches = Element.prototype.matches;

    // jsdom не знает :focus-visible: считаем фокус клавиатурным.
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector) {
      return selector === ':focus-visible' ? true : matches.call(this, selector);
    });

    button.focus();
    vi.runOnlyPendingTimers();
    expect(bubble()?.textContent).toBe('Insert row below');

    button.blur();
    expect(bubble()).toBeNull();
  });
});

describe('installTooltips', () => {
  it('loads the bubble once for several editors and removes it with the last one', async () => {
    const first = installTooltips();
    const second = installTooltips();

    // Чанк подгружается сразу; оба редактора делят один обработчик.
    await vi.dynamicImportSettled();

    first();
    second();
    expect(bubble()).toBeNull();
  });
});
