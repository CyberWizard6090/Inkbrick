import { flushSync } from 'react-dom';

import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import type { DragState, DropIndicatorRect, DropPosition } from './BlockHandleController';
import { blockAtPoint, blockElement, probePoint, rowRect } from './geometry';

export interface BlockDropTarget {
  readonly targetId: string;
  readonly position: DropPosition;
  readonly indicator: DropIndicatorRect;
}

export interface BlockRects {
  /** Строка самого блока (его текст), без вложенных блоков. */
  readonly row: DOMRect;
  /** Весь блок вместе с вложенными блоками. */
  readonly box: DOMRect;
}

/**
 * Всё, что нужно своей системе перетаскивания блоков (dnd-kit, pragmatic-drag-and-drop, своя на pointer events):
 * геометрия, проверка цели, линия вставки и сам перенос. Встроенное перетаскивание построено на этом же API.
 *
 * Обычный порядок: `start(blockId)` → на каждое движение `update(x, y)` → `drop()` или `cancel()`.
 */
export interface BlockDragApi {
  /** Блок с ручкой под точкой окна; точку в полосе слева от текста прижимает к тексту. */
  blockAtPoint(x: number, y: number): string | null;
  blockRects(blockId: string): BlockRects | null;
  /** Можно ли перенести блок `blockId` перед/после `targetId` (схема, вложенность, глубина). */
  canMove(blockId: string, targetId: string, position: DropPosition): boolean;
  /** Допустимое место вставки под точкой окна для блока `blockId`; верхняя половина строки — «перед». */
  dropTargetAt(blockId: string, x: number, y: number): BlockDropTarget | null;

  start(blockId: string): void;
  /** Задаёт текущее место вставки (или убирает его) и рисует линию. Цель, которую движок не примет, отбрасывается. */
  setTarget(target: BlockDropTarget | null): void;
  /** Удобная связка `dropTargetAt` + `setTarget` с автопрокруткой у края окна. Возвращает найденную цель. */
  update(x: number, y: number): BlockDropTarget | null;
  /** Завершает перенос: применяет его к текущей цели одним шагом undo. `true`, если блок перенесён. */
  drop(): boolean;
  cancel(): void;

  /** Переносит блок сразу, без жеста (например, из своего DnD без линии вставки). Один шаг undo. */
  move(blockId: string, targetId: string, position: DropPosition): boolean;
  autoScroll(clientY: number): void;

  getState(): DragState | null;
  subscribe(listener: () => void): () => void;
}

const EDGE = 56;

const cache = new WeakMap<EditorView, BlockDragApi>();

export function getBlockDrag(editor: Editor, view: EditorView): BlockDragApi {
  let api = cache.get(view);

  if (!api) {
    api = createBlockDrag(editor, view);
    cache.set(view, api);
  }

  return api;
}

function createBlockDrag(editor: Editor, view: EditorView): BlockDragApi {
  const controller = view.blocks;

  const markBody = (on: boolean) => {
    if (typeof document === 'undefined') return;

    document.body.classList.toggle('inkbrick-dragging', on);

    if (on) document.body.setAttribute('data-inkbrick-dragging', '');
    else document.body.removeAttribute('data-inkbrick-dragging');
  };

  const canMove = (blockId: string, targetId: string, position: DropPosition) =>
    blockId !== targetId && editor.can('moveBlock', { blockId, targetId, position });

  const blockRects = (blockId: string): BlockRects | null => {
    const wrapper = blockElement(view, blockId);
    const row = rowRect(view, blockId);

    return wrapper && row ? { row, box: wrapper.getBoundingClientRect() } : null;
  };

  const api: BlockDragApi = {
    blockAtPoint(x, y) {
      const probe = probePoint(view, x, y);

      return probe ? blockAtPoint(editor, view, probe.x, probe.y) : null;
    },

    blockRects,
    canMove,

    dropTargetAt(blockId, x, y) {
      const targetId = api.blockAtPoint(x, y);
      const rects = targetId ? blockRects(targetId) : null;

      if (!targetId || !rects) return null;

      const { row, box } = rects;
      const position: DropPosition = y < row.top + row.height / 2 ? 'before' : 'after';

      if (!canMove(blockId, targetId, position)) return null;

      return {
        targetId,
        position,
        // «После» — после всего поддерева цели (вместе с вложенными блоками).
        indicator: {
          left: box.left,
          width: box.width,
          top: position === 'before' ? row.top - 1 : box.bottom + 1,
        },
      };
    },

    start(blockId) {
      controller.startDrag(blockId);
      markBody(true);
    },

    setTarget(target) {
      const drag = controller.getState().drag;

      if (!drag) return;

      if (!target || !canMove(drag.blockId, target.targetId, target.position)) {
        controller.updateDrag({ targetId: null, position: null, indicator: null });
        return;
      }

      controller.updateDrag({
        targetId: target.targetId,
        position: target.position,
        indicator: target.indicator,
      });
    },

    update(x, y) {
      const drag = controller.getState().drag;

      if (!drag) return null;

      api.autoScroll(y);

      const target = api.dropTargetAt(drag.blockId, x, y);

      api.setTarget(target);

      return target;
    },

    drop() {
      const drag = controller.getState().drag;

      controller.endDrag();
      markBody(false);

      if (!drag?.targetId || !drag.position) return false;

      return api.move(drag.blockId, drag.targetId, drag.position);
    },

    cancel() {
      controller.endDrag();
      markBody(false);
    },

    move(blockId, targetId, position) {
      if (!canMove(blockId, targetId, position)) return false;

      const payload = { blockId, targetId, position };

      // Синхронно обновляем DOM: сразу после переноса можно мерить блоки на новых местах.
      flushSync(() => {
        editor.dispatch({ type: 'moveBlock', payload });
      });

      controller.setHover(null);

      return true;
    },

    autoScroll(clientY) {
      if (typeof window === 'undefined') return;

      if (clientY < EDGE) window.scrollBy(0, -14);
      else if (clientY > window.innerHeight - EDGE) window.scrollBy(0, 14);
    },

    getState: () => controller.getState().drag,

    subscribe: (listener) => {
      let last = controller.getState().drag;

      return controller.subscribe(() => {
        const next = controller.getState().drag;

        if (next !== last) {
          last = next;
          listener();
        }
      });
    },
  };

  return api;
}
