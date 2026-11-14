import { rangeForPoints, type DocPoint } from '../editing/selection';

/** Чужой курсор в координатах модели: где стоит голова выделения и (если оно не свёрнуто) где его якорь. */
export interface RemoteCursor {
  readonly id: string | number;
  readonly name: string;
  /** Цвет CSS (`#2f6fed`): им рисуются каретка, флажок и подсветка выделения. */
  readonly color: string;
  readonly head: DocPoint;
  readonly anchor?: DocPoint;
}

export interface CursorBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CursorGeometry {
  readonly id: string | number;
  readonly name: string;
  readonly color: string;
  /** Каретка головы; `null`, если блока нет в DOM. */
  readonly caret: CursorBox | null;
  /** Прямоугольники подсветки выделения, по одному на строку. */
  readonly selection: readonly CursorBox[];
}

function toBox(rect: DOMRect | DOMRectReadOnly, origin: { left: number; top: number }): CursorBox {
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
  };
}

const CARET_WIDTH = 2;

/** Прямоугольник каретки: у пустого блока и у границ браузер часто отдаёт пустой rect, тогда берём начало блока. */
function caretBox(
  root: HTMLElement,
  point: DocPoint,
  origin: { left: number; top: number },
): CursorBox | null {
  const range = rangeForPoints(root, point);

  if (!range) return null;

  const rect =
    [...range.getClientRects()].find((item) => item.height > 0) ?? range.getBoundingClientRect();

  if (rect && rect.height > 0) {
    return { ...toBox(rect, origin), width: CARET_WIDTH };
  }

  const element = root.querySelector<HTMLElement>(
    `.editable[data-id="${CSS.escape(point.blockId)}"]`,
  );

  if (!element) return null;

  const block = element.getBoundingClientRect();
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  const height = Number.isFinite(lineHeight) ? lineHeight : block.height || 20;

  return {
    left: block.left - origin.left,
    top: block.top - origin.top,
    width: CARET_WIDTH,
    height,
  };
}

/**
 * Переводит чужие курсоры в прямоугольники относительно `origin` (левый верхний угол слоя). Курсор, чей блок сейчас
 * не отрисован, получает `caret: null` и ничего не рисует.
 */
export function layoutCursors(
  root: HTMLElement,
  origin: { left: number; top: number },
  cursors: readonly RemoteCursor[],
): CursorGeometry[] {
  return cursors.map((cursor) => {
    const caret = caretBox(root, cursor.head, origin);
    const selection: CursorBox[] = [];

    if (
      cursor.anchor &&
      (cursor.anchor.blockId !== cursor.head.blockId || cursor.anchor.offset !== cursor.head.offset)
    ) {
      const range = rangeForPoints(root, cursor.anchor, cursor.head);

      if (range) {
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) selection.push(toBox(rect, origin));
        }
      }
    }

    return { id: cursor.id, name: cursor.name, color: cursor.color, caret, selection };
  });
}
