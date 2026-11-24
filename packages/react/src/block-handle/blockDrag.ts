import { flushSync } from 'react-dom';

import type { Editor } from '@inkbrick/engine';

import { readDocSelection } from '@inkbrick/view';
import type {
  EditorView,
  DragState,
  DropIndicatorRect,
  DropPosition,
  DropSide,
} from '@inkbrick/view';
import { pickedOwner, targetsOf } from '../pick/actions';
import { blockAtPoint, blockElement, probePoint, rowRect } from './geometry';

export interface BlockDropTarget {
  readonly targetId: string;
  /** `before`/`after`; у цели со `side` — `before` слева и `after` справа. */
  readonly position: DropPosition;
  /** Задана, когда блок встаёт рядом с целью (в колонки), а не до или после неё: нужны колонки (`columnsBlocks`). */
  readonly side?: DropSide;
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

  /**
   * Ставит блок рядом с `targetId`, в колонки: слева или справа; ряд выбранных блоков встаёт туда целиком, по порядку.
   * Один шаг undo. Нужны колонки (`columnsBlocks`).
   */
  moveToSide(blockId: string, targetId: string, side: DropSide): boolean;
  /** Переносит блок сразу, без жеста (например, из своего DnD без линии вставки). Один шаг undo. */
  move(blockId: string, targetId: string, position: DropPosition): boolean;
  autoScroll(clientY: number): void;

  getState(): DragState | null;
  subscribe(listener: () => void): () => void;
}

const EDGE = 56;
/** Полоса у левого и правого края строки блока (не шире пятой части строки), где блок встаёт рядом, а не до или после. */
const SIDE_ZONE = 24;

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

  // Перетаскивание блока из выбранного ряда переносит весь ряд одним жестом; цель внутри ряда недопустима.
  // Ручка блока внутри выбранного блока несёт выбранный блок целиком.
  const own = (blockId: string) => pickedOwner(editor, view, blockId);

  const canMove = (dragged: string, targetId: string, position: DropPosition) => {
    const blockId = own(dragged);
    const group = targetsOf(view, blockId);

    return (
      !group.includes(targetId) &&
      group.every((id) => editor.can('moveBlock', { blockId: id, targetId, position }))
    );
  };

  // Ряд выбранных блоков встаёт рядом с целью целиком: первый — в новую колонку, остальные — под ним.
  // Цель не может быть одним из переносимых блоков или лежать внутри него: блок не встаёт в колонку внутри себя.
  const canMoveToSide = (dragged: string, targetId: string, side: DropSide) => {
    const group = new Set(targetsOf(view, own(dragged)));

    for (let id: string | null = targetId; id; id = editor.store.getBlock(id)?.parentId ?? null) {
      if (group.has(id)) return false;
    }

    return editor.can('moveBlockToSide', { blockId: [...group][0], targetId, side });
  };

  /**
   * Перенос перерисовывает блоки, и выделение браузера оказывается в соседнем блоке: набор шёл бы не туда. Курсор
   * (или выделение) запоминается в координатах документа и ставится обратно — в тот же блок на его новом месте.
   */
  const keepingSelection = (run: () => void) => {
    const root = view.getRoot();
    const kept = root && document.activeElement === root ? readDocSelection(root) : null;

    flushSync(run);

    if (
      kept &&
      editor.store.getBlock(kept.from.blockId) &&
      editor.store.getBlock(kept.to.blockId)
    ) {
      view.placeSelection(kept.from, kept.to);
    }
  };

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
      const zone = Math.min(SIDE_ZONE, row.width * 0.2);
      // Слева от текста — полоса ручки: там обычная вставка до/после; сторона — только внутри строки.
      const side: DropSide | null =
        x >= row.left && x < row.left + zone
          ? 'left'
          : x > row.right - zone && x <= row.right
            ? 'right'
            : null;

      if (side && canMoveToSide(blockId, targetId, side)) {
        return {
          targetId,
          position: side === 'left' ? 'before' : 'after',
          side,
          indicator: {
            left: side === 'left' ? box.left - 2 : box.right - 1,
            top: box.top,
            width: 3,
            height: box.height,
          },
        };
      }

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
      controller.startDrag(own(blockId));
      markBody(true);
    },

    setTarget(target) {
      const drag = controller.getState().drag;

      if (!drag) return;

      const allowed = target
        ? target.side
          ? canMoveToSide(drag.blockId, target.targetId, target.side)
          : canMove(drag.blockId, target.targetId, target.position)
        : false;

      if (!target || !allowed) {
        controller.updateDrag({ targetId: null, position: null, side: null, indicator: null });
        return;
      }

      controller.updateDrag({
        targetId: target.targetId,
        position: target.position,
        side: target.side ?? null,
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

      return drag.side
        ? api.moveToSide(drag.blockId, drag.targetId, drag.side)
        : api.move(drag.blockId, drag.targetId, drag.position);
    },

    cancel() {
      controller.endDrag();
      markBody(false);
    },

    moveToSide(blockId, targetId, side) {
      if (!canMoveToSide(blockId, targetId, side)) return false;

      const [first, ...rest] = targetsOf(view, own(blockId));

      // Один шаг undo: первый блок открывает колонку, остальные встают под ним по порядку.
      keepingSelection(() => {
        editor.batch(() => {
          editor.dispatch({ type: 'moveBlockToSide', payload: { blockId: first, targetId, side } });

          let after = first;

          for (const id of rest) {
            editor.dispatch({
              type: 'moveBlock',
              payload: { blockId: id, targetId: after, position: 'after' },
            });
            after = id;
          }
        });
      });

      controller.setHover(null);

      return true;
    },

    move(blockId, targetId, position) {
      if (!canMove(blockId, targetId, position)) return false;

      // Ряд выбранных блоков: перед целью — по порядку, после неё — с конца, порядок внутри ряда сохраняется.
      const group = targetsOf(view, own(blockId));
      const order = position === 'before' ? group : [...group].reverse();

      // Синхронно обновляем DOM: сразу после переноса можно мерить блоки на новых местах. Один шаг undo.
      keepingSelection(() => {
        editor.batch(() => {
          for (const id of order) {
            editor.dispatch({ type: 'moveBlock', payload: { blockId: id, targetId, position } });
          }
        });
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
