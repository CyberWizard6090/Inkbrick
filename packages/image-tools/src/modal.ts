import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Где показывать окно: внутри элемента с темой (если он задан), иначе в `body`. */
export function overlayHost(container: Element | null | undefined): Element | null {
  if (container) return container;

  return typeof document === 'undefined' ? null : document.body;
}

/**
 * Поведение модального окна: фокус уходит внутрь (на `initial` или первый элемент) и возвращается туда, где был, при
 * закрытии; страница под окном не прокручивается. Возвращает обработчик клавиш для самого окна: Escape закрывает его
 * (если вложенный элемент, например меню, не забрал клавишу себе), Tab ходит по кругу внутри окна.
 */
export function useModal(
  dialog: RefObject<HTMLElement | null>,
  onClose: () => void,
  initial?: RefObject<HTMLElement | null>,
): (event: KeyboardEvent<HTMLElement>) => void {
  const close = useRef(onClose);

  close.current = onClose;

  useEffect(() => {
    const element = dialog.current;

    if (!element) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;

    root.style.overflow = 'hidden';

    const focusInside = () => {
      if (element.contains(document.activeElement)) return;

      (initial?.current ?? element.querySelector<HTMLElement>(FOCUSABLE))?.focus({
        preventScroll: true,
      });

      // Нужный элемент ещё скрыт (например, рамка до загрузки картинки): фокус — на само окно.
      if (!element.contains(document.activeElement)) element.focus({ preventScroll: true });
    };

    focusInside();
    // Окно часто открывается из обработчика, после которого страница сама ставит фокус (например, редактор — каретку
    // под новой картинкой): забираем фокус обратно в следующем кадре.
    const frame = requestAnimationFrame(focusInside);

    return () => {
      cancelAnimationFrame(frame);
      root.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
    // Окно настраивается один раз на время жизни.
  }, []);

  return (event) => {
    if (event.defaultPrevented) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close.current();

      return;
    }

    const element = dialog.current;

    if (event.key !== 'Tab' || !element) return;

    const items = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)];

    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/** Размер элемента в пикселях; следит за изменениями (без `ResizeObserver` — за размером окна). */
export function useElementSize(element: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const node = element.current;

    if (!node) return;

    const measure = () => {
      const box = node.getBoundingClientRect();

      setSize((current) =>
        current && current.width === box.width && current.height === box.height
          ? current
          : { width: box.width, height: box.height },
      );
    };

    measure();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);

      observer.observe(node);

      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);

    return () => window.removeEventListener('resize', measure);
  }, [element, setSize]);

  return size;
}
