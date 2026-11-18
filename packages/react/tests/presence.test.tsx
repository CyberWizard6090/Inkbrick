import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { Presence } from '../src/ui/Presence';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Подмена стилей: в jsdom нет CSS пакета, поэтому «анимацию выхода» задаём руками. */
function animate(name: string, duration = '0.1s') {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        animationName: name,
        animationDuration: duration,
        animationDelay: '0s',
      }) as CSSStyleDeclaration,
  );
}

const content = (text: string) => <div data-testid="content">{text}</div>;
const find = (container: HTMLElement) => container.querySelector('[data-testid="content"]');
const wrapperOf = (container: HTMLElement) => container.querySelector('[data-inkbrick-presence]');
const end = (element: Element, name: string, type = 'animationend') =>
  act(() => {
    element.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true }), { animationName: name }),
    );
  });

describe('Presence', () => {
  it('shows the content while open and removes it at once when there is no animation', () => {
    const { container, rerender } = render(<Presence open render={() => content('a')} />);

    expect(find(container)?.textContent).toBe('a');
    expect(wrapperOf(container)?.getAttribute('data-state')).toBe('open');

    rerender(<Presence open={false} render={() => content('b')} />);

    expect(wrapperOf(container)).toBeNull();
    expect(find(container)).toBeNull();
  });

  it('keeps the last content in the closed state until the exit animation ends', () => {
    animate('fade-out');

    const { container, rerender } = render(<Presence open render={() => content('a')} />);

    rerender(<Presence open={false} render={() => content('later')} />);

    // Остаётся то, что было нарисовано в последний раз, а не то, что render вернул бы сейчас.
    expect(find(container)?.textContent).toBe('a');
    expect(wrapperOf(container)?.getAttribute('data-state')).toBe('closed');
    expect(wrapperOf(container)?.getAttribute('aria-hidden')).toBe('true');

    end(find(container)!, 'fade-out');

    expect(wrapperOf(container)).toBeNull();
  });

  it('ignores the cancel of another animation, for example the entrance that was still running', () => {
    animate('fade-out');

    const { container, rerender } = render(<Presence open render={() => content('a')} />);

    rerender(<Presence open={false} render={() => content('a')} />);
    end(find(container)!, 'menu-in', 'animationcancel');

    expect(find(container)).not.toBeNull();

    end(find(container)!, 'fade-out');

    expect(find(container)).toBeNull();
  });

  it('removes the content after the time of the animation even if no event comes', () => {
    vi.useFakeTimers();
    animate('fade-out', '0.2s');

    const { container, rerender } = render(<Presence open render={() => content('a')} />);

    rerender(<Presence open={false} render={() => content('a')} />);
    expect(find(container)).not.toBeNull();

    act(() => void vi.advanceTimersByTime(250));
    expect(find(container)).not.toBeNull();

    act(() => void vi.advanceTimersByTime(100));
    expect(find(container)).toBeNull();
  });

  it('opening again during the exit creates the content anew, so its mount effects run again', () => {
    animate('fade-out');

    const { container, rerender } = render(<Presence open render={() => content('a')} />);
    const node = find(container);

    rerender(<Presence open={false} render={() => content('a')} />);
    rerender(<Presence open render={() => content('again')} />);

    expect(find(container)).not.toBe(node);
    expect(find(container)?.textContent).toBe('again');
    expect(wrapperOf(container)?.getAttribute('data-state')).toBe('open');

    // Конец старого выхода уже ничего не удаляет.
    end(find(container)!, 'fade-out');
    expect(find(container)).not.toBeNull();
  });

  it('with reuse the same node comes back, with its state', () => {
    animate('fade-out');

    const { container, rerender } = render(<Presence reuse open render={() => content('a')} />);
    const node = find(container);

    rerender(<Presence reuse open={false} render={() => content('a')} />);
    rerender(<Presence reuse open render={() => content('again')} />);

    expect(find(container)).toBe(node);
    expect(find(container)?.textContent).toBe('again');

    end(find(container)!, 'fade-out');
    expect(find(container)).not.toBeNull();
  });

  it('opens and closes again after a finished exit', () => {
    animate('fade-out');

    const { container, rerender } = render(<Presence open render={() => content('a')} />);

    rerender(<Presence open={false} render={() => content('a')} />);
    end(find(container)!, 'fade-out');
    expect(find(container)).toBeNull();

    rerender(<Presence open render={() => content('b')} />);
    expect(find(container)?.textContent).toBe('b');

    rerender(<Presence open={false} render={() => content('b')} />);
    expect(wrapperOf(container)?.getAttribute('data-state')).toBe('closed');
    end(find(container)!, 'fade-out');
    expect(find(container)).toBeNull();
  });

  it('does not render anything for a content that was never opened', () => {
    animate('fade-out');

    const { container } = render(<Presence open={false} render={() => content('a')} />);

    expect(container.innerHTML).toBe('');
  });
});
