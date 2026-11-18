import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { animateCollapse, useCollapse } from '../src/ui/collapse';

/** Анимация, которой управляет тест: `finish()` — «закончилась», `cancel()` — прервана новой. */
interface Fake {
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
  onfinish: (() => void) | null;
  cancelled: boolean;
  cancel(): void;
  finish(): void;
}

let made: Fake[] = [];
let height = 100;

beforeEach(() => {
  made = [];
  height = 100;

  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const fake: Fake = {
        keyframes,
        options,
        onfinish: null,
        cancelled: false,
        cancel() {
          fake.cancelled = true;
        },
        finish() {
          fake.onfinish?.();
        },
      };

      made.push(fake);

      return fake;
    },
  });
  // Пока анимация идёт, высота «текущая» (`height`); после отмены или без анимации — естественная, 100.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => {
    const last = made[made.length - 1];
    const current = last && !last.cancelled ? height : 100;

    return { height: current, width: 10, top: 0, left: 0, right: 10, bottom: current } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  Reflect.deleteProperty(window, 'matchMedia');
});

function Panel({ open }: { open: boolean }) {
  const nested = useCollapse<HTMLDivElement>(open);

  return nested.mounted ? (
    <div ref={nested.ref} data-testid="panel">
      content
    </div>
  ) : null;
}

const panel = (container: HTMLElement) => container.querySelector('[data-testid="panel"]');

describe('useCollapse', () => {
  it('shows an open panel without any animation on the first render', () => {
    const { container } = render(<Panel open />);

    expect(panel(container)).not.toBeNull();
    expect(made).toHaveLength(0);
  });

  it('keeps the panel in the tree while it shrinks and removes it when the animation ends', () => {
    const { container, rerender } = render(<Panel open />);

    rerender(<Panel open={false} />);

    expect(panel(container)).not.toBeNull();
    expect(made).toHaveLength(1);
    expect(made[0].keyframes[0]).toMatchObject({ height: '100px', opacity: 1 });
    expect(made[0].keyframes[1]).toMatchObject({ height: '0px', opacity: 0 });
    expect((panel(container) as HTMLElement).style.overflow).toBe('hidden');

    act(() => made[0].finish());

    expect(panel(container)).toBeNull();
  });

  it('opens with an animation from zero and gives the overflow back when it ends', () => {
    const { container, rerender } = render(<Panel open={false} />);

    expect(panel(container)).toBeNull();

    rerender(<Panel open />);

    const element = panel(container) as HTMLElement;

    expect(made).toHaveLength(1);
    expect(made[0].keyframes[0]).toMatchObject({ height: '0px', opacity: 0 });
    expect(made[0].keyframes[1]).toMatchObject({ height: '100px', opacity: 1 });
    expect(element.style.overflow).toBe('hidden');

    act(() => made[0].finish());

    expect(element.style.overflow).toBe('');
    expect(panel(container)).not.toBeNull();
  });

  it('turns around from where the panel is now when it is toggled in the middle', () => {
    const { container, rerender } = render(<Panel open />);

    rerender(<Panel open={false} />);
    height = 40; // сейчас панель сжалась до 40 из 100

    rerender(<Panel open />);

    expect(made[0].cancelled).toBe(true);
    expect(made).toHaveLength(2);
    expect(made[1].keyframes[0]).toMatchObject({ height: '40px', opacity: 0.4 });
    // Осталось пройти 60% пути, а не весь путь.
    expect(made[1].options.duration).toBeCloseTo(220 * 0.6, 5);

    // Конец прерванной анимации ничего не убирает.
    act(() => made[0].finish());
    expect(panel(container)).not.toBeNull();
  });

  it('removes the panel at once when the animation cannot run', () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');

    const { container, rerender } = render(<Panel open />);

    rerender(<Panel open={false} />);

    expect(panel(container)).toBeNull();
  });

  it('does not move with prefers-reduced-motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList,
    });

    const { container, rerender } = render(<Panel open />);

    rerender(<Panel open={false} />);

    expect(made).toHaveLength(0);
    expect(panel(container)).toBeNull();
  });
});

describe('animateCollapse', () => {
  it('reads the duration and the curve from the tokens, and 0ms turns it off', () => {
    const element = document.createElement('div');

    document.body.appendChild(element);
    element.style.setProperty('--inkbrick-collapse-duration', '0.5s');
    element.style.setProperty('--inkbrick-curve', 'linear');

    expect(animateCollapse(element, 'closed')).toBe(true);
    expect(made[0].options).toMatchObject({ duration: 500, easing: 'linear' });

    element.style.setProperty('--inkbrick-collapse-duration', '0ms');

    expect(animateCollapse(element, 'open')).toBe(false);
    element.remove();
  });

  it('does nothing for an element that has no height to close', () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
      height: 0,
    } as DOMRect);

    const element = document.createElement('div');

    expect(animateCollapse(element, 'closed')).toBe(false);
    expect(made).toHaveLength(0);
  });
});
