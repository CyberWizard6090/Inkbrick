const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Где показывать окно: внутри элемента с темой (если он задан), иначе в `body`. */
export const overlayHost = (container: Element | null | undefined): Element =>
  container ?? document.body;

export interface ModalOptions {
  /** Куда поставить фокус при открытии (иначе — первый элемент окна или само окно). */
  readonly initial?: () => HTMLElement | null | undefined;
  /** Escape, если вложенный элемент (например, меню) не забрал клавишу себе (`preventDefault`). */
  onEscape(): void;
}

/**
 * Поведение модального окна: фокус уходит внутрь и возвращается туда, где был, при закрытии; страница под окном не
 * прокручивается; Escape закрывает; Tab ходит по кругу внутри окна. Возвращает отмену всего этого.
 */
export function modal(dialog: HTMLElement, { initial, onEscape }: ModalOptions): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.documentElement;
  const overflow = root.style.overflow;

  root.style.overflow = 'hidden';

  const focusInside = () => {
    if (dialog.contains(document.activeElement)) return;

    (initial?.() ?? dialog.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });

    // Нужный элемент ещё скрыт (например, рамка до загрузки картинки): фокус — на само окно.
    if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
  };

  const key = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onEscape();

      return;
    }

    if (event.key !== 'Tab') return;

    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];

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

  focusInside();
  // Окно часто открывается из обработчика, после которого страница сама ставит фокус (например, редактор — каретку под
  // новой картинкой): забираем фокус обратно в следующем кадре.
  const frame = requestAnimationFrame(focusInside);

  dialog.addEventListener('keydown', key);

  return () => {
    cancelAnimationFrame(frame);
    dialog.removeEventListener('keydown', key);
    root.style.overflow = overflow;
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  };
}

/** Следит за размером элемента (без `ResizeObserver` — за размером окна); возвращает отмену. */
export function watchSize(
  element: HTMLElement,
  onSize: (width: number, height: number) => void,
): () => void {
  const measure = () => {
    const box = element.getBoundingClientRect();

    onSize(box.width, box.height);
  };

  measure();

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => observer.disconnect();
  }

  window.addEventListener('resize', measure);

  return () => window.removeEventListener('resize', measure);
}
