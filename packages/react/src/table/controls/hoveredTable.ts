/**
 * Какая таблица сейчас под указателем. Ручки есть у таблицы под мышью и у таблицы с кареткой; когда мышь над другой
 * таблицей, ручки той, где стоит каретка, прячутся: иначе две соседние таблицы рисуют их друг поверх друга.
 */
let hoveredTable: string | null = null;
const hoverListeners = new Set<() => void>();

export const getHoveredTable = () => hoveredTable;

export function setHoveredTable(id: string | null) {
  if (hoveredTable === id) return;

  hoveredTable = id;
  hoverListeners.forEach((listener) => listener());
}

export const subscribeHovered = (listener: () => void) => {
  hoverListeners.add(listener);

  return () => void hoverListeners.delete(listener);
};

/** Расстояние от точки до прямоугольника: 0, если точка внутри. */
function distanceTo(rect: DOMRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);

  return Math.hypot(dx, dy);
}

/** Ближайшая к точке таблица документа: между двумя таблицами ручки показывает только она. */
export function nearestTable(x: number, y: number): Element | null {
  let best: Element | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const element of document.querySelectorAll('[data-inkbrick-block="table"]')) {
    const distance = distanceTo(element.getBoundingClientRect(), x, y);

    if (distance < bestDistance) {
      best = element;
      bestDistance = distance;
    }
  }

  return best;
}
