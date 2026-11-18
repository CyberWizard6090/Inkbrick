import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

const BOX = ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom'] as const;

interface Running {
  readonly animation: Animation;
  /** Значение inline-`overflow` до анимации: его вернут, когда она закончится. */
  readonly overflow: string;
}

const running = new WeakMap<HTMLElement, Running>();

/** Миллисекунды из значения CSS (`220ms`, `0.2s`); `NaN`, если это не время. */
function cssTime(value: string): number {
  const text = value.trim();

  if (text.endsWith('ms')) return parseFloat(text);
  if (text.endsWith('s')) return parseFloat(text) * 1000;

  return Number.NaN;
}

/** Нужно ли двигаться: у системы не включено «уменьшить движение» и API анимаций есть (в jsdom его нет). */
function canAnimate(element: HTMLElement): boolean {
  if (typeof element.animate !== 'function') return false;

  return !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Плавно раскрывает (`open`) или сворачивает (`closed`) элемент по высоте: высота, прозрачность и вертикальные отступы идут
 * от текущего значения к нулю или к естественным. Длительность и кривая — токены `--inkbrick-collapse-duration` и
 * `--inkbrick-curve`; `0ms` и `prefers-reduced-motion` выключают движение. Если элемент уже в движении (клик посреди
 * анимации), новая анимация начинается с того места, где он сейчас, поэтому разворот не прыгает.
 *
 * Возвращает `true`, если анимация запущена; `done` вызывается, когда она закончилась (но не если её прервали новой).
 * Без анимации возвращает `false` и `done` не вызывает: вызывающий решает, что делать сразу.
 */
export function animateCollapse(
  element: HTMLElement,
  to: 'open' | 'closed',
  done?: () => void,
): boolean {
  if (!canAnimate(element)) return false;

  const style = getComputedStyle(element);
  const duration = cssTime(style.getPropertyValue('--inkbrick-collapse-duration'));
  const total = Number.isNaN(duration) ? 220 : duration;

  if (total <= 0) return false;

  const previous = running.get(element);
  const mid = previous ? element.getBoundingClientRect().height : null;

  previous?.animation.cancel();

  const overflow = previous ? previous.overflow : element.style.overflow;
  const natural = element.getBoundingClientRect().height;

  if (natural === 0 && to === 'closed') return false;

  const computed = getComputedStyle(element);
  const full: Keyframe = { height: `${natural}px`, opacity: 1 };

  for (const key of BOX) full[key] = computed[key];

  // Доля «раскрытости», с которой начинаем: у уже двигавшегося элемента — где он сейчас, у нового — край.
  const progress =
    mid === null ? (to === 'open' ? 0 : 1) : Math.min(1, Math.max(0, mid / (natural || 1)));
  const empty: Keyframe = { height: '0px', opacity: 0 };

  for (const key of BOX) empty[key] = '0px';

  const start: Keyframe = { height: `${natural * progress}px`, opacity: progress };

  for (const key of BOX) start[key] = `${parseFloat(computed[key]) * progress}px`;

  const distance = to === 'open' ? 1 - progress : progress;

  if (distance <= 0.001) return false;

  element.style.overflow = 'hidden';

  const animation = element.animate([start, to === 'open' ? full : empty], {
    duration: total * distance,
    easing: style.getPropertyValue('--inkbrick-curve').trim() || 'ease',
  });

  running.set(element, { animation, overflow });

  const finish = () => {
    if (running.get(element)?.animation !== animation) return;

    running.delete(element);
    element.style.overflow = overflow;
    done?.();
  };

  animation.onfinish = finish;

  return true;
}

/**
 * Содержимое, которое раскрывается и сворачивается плавно (вложенные блоки переключателя и пункта списка). Пока оно
 * уходит, остаётся в дереве; потом убирается, как и раньше, когда `open` был `false`. Без анимации убирается сразу.
 * `ref` ставится на элемент, который двигается.
 */
export function useCollapse<T extends HTMLElement>(
  open: boolean,
): { readonly mounted: boolean; readonly ref: RefObject<T | null> } {
  const ref = useRef<T>(null);
  const [exited, setExited] = useState(!open);
  const first = useRef(true);

  // Открыли снова, пока содержимое ещё уходило или уже ушло: оно снова нужно.
  if (open && exited) setExited(false);

  useLayoutEffect(() => {
    const initial = first.current;

    first.current = false;

    // Первая отрисовка не анимируется: блок просто показан таким, какой он есть.
    if (initial) return;

    const element = ref.current;

    if (open) {
      if (element) animateCollapse(element, 'open');
    } else if (!element || !animateCollapse(element, 'closed', () => setExited(true))) {
      setExited(true);
    }
  }, [open]);

  return { mounted: open || !exited, ref };
}
