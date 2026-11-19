import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { pickRun } from './actions';

/** Полоса у края окна, где рамка начинает прокручивать документ. */
const EDGE = 48;
/** Предел скорости прокрутки, пикселей за кадр. */
const MAX_SPEED = 28;

export interface Marquee {
  /** Новое положение указателя (координаты окна): рамка и выбор обновятся в ближайшем кадре. */
  move(x: number, y: number): void;
  /** Убирает рамку; выбор остаётся как есть и делается цельным рядом. */
  end(): void;
}

/** Где точка относительно блока: внутри (0), в зазоре перед ним (-1) или после него (1). */
interface Spot {
  readonly id: string;
  readonly side: -1 | 0 | 1;
}

function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    if (
      /(auto|scroll)/.test(getComputedStyle(node).overflowY) &&
      node.scrollHeight > node.clientHeight
    )
      return node;
  }

  return null;
}

/**
 * Рамка выбора блоков мышью. Блоки находятся по нарисованным строкам верхнего уровня (бинарным поиском по границам), а не
 * обходом всей заметки, поэтому цена кадра не зависит от размера документа. Начало рамки привязано к блоку, а не к
 * координатам, поэтому при автопрокрутке и виртуальном рендере выбор не «плывёт». Всё обновляется раз в кадр.
 */
export function startMarquee(
  editor: Editor,
  view: EditorView,
  origin: { x: number; y: number },
): Marquee {
  const root = view.getRoot()!;
  const note = editor.document.getBlock(editor.document.rootId)?.children[0];
  const level = note ? (editor.store.getBlock(note)?.children ?? []) : [];
  const scroller = scrollParent(root);
  const scrolled = () => (scroller ? scroller.scrollTop : window.scrollY);
  const frame = globalThis.document.createElement('div');
  const originTop = origin.y + scrolled();
  let x = origin.x;
  let y = origin.y;
  let raf = 0;

  frame.setAttribute('data-inkbrick-ui', 'marquee');
  frame.style.cssText = 'position:fixed;pointer-events:none;';
  globalThis.document.body.appendChild(frame);

  /** Нарисованные блоки верхнего уровня с их границами, сверху вниз. */
  const rows = () => {
    const found: { id: string; top: number; bottom: number }[] = [];

    for (const element of root.querySelectorAll('[data-block-id]')) {
      const id = element.getAttribute('data-block-id')!;

      if (editor.store.getBlock(id)?.parentId !== note) continue;

      const rect = element.getBoundingClientRect();

      if (rect.height > 0) found.push({ id, top: rect.top, bottom: rect.bottom });
    }

    return found;
  };

  const locate = (list: ReturnType<typeof rows>, at: number): Spot | null => {
    if (list.length === 0) return null;

    let low = 0;
    let high = list.length;

    // Первый блок, нижняя граница которого не выше точки.
    while (low < high) {
      const middle = (low + high) >>> 1;

      if (list[middle].bottom >= at) high = middle;
      else low = middle + 1;
    }

    if (low === list.length) return { id: list[low - 1].id, side: 1 };

    return { id: list[low].id, side: at >= list[low].top ? 0 : -1 };
  };

  // Начало рамки определяем сразу, пока оно на экране: дальше рамка привязана к этому блоку.
  const anchor = locate(rows(), origin.y);

  const update = () => {
    raf = 0;

    const top = Math.min(originTop - scrolled(), y);
    const bottom = Math.max(originTop - scrolled(), y);

    Object.assign(frame.style, {
      left: `${Math.min(origin.x, x)}px`,
      top: `${top}px`,
      width: `${Math.abs(x - origin.x)}px`,
      height: `${bottom - top}px`,
    });

    const list = rows();

    const focus = locate(list, y);

    if (!anchor || !focus) return;

    const from = level.indexOf(anchor.id);
    const to = level.indexOf(focus.id);
    let ids: readonly string[];

    if (to === from) {
      // Оба конца в одном зазоре между блоками — рамка ничего не задевает.
      const empty = anchor.side === focus.side && anchor.side !== 0;

      ids = empty ? [] : [anchor.id];
    } else if (to > from) {
      ids = level.slice(anchor.side === 1 ? from + 1 : from, focus.side === -1 ? to : to + 1);
    } else {
      ids = level.slice(focus.side === 1 ? to + 1 : to, anchor.side === -1 ? from : from + 1);
    }

    const down = to >= from;

    view.picked.set(ids, down ? ids[0] : ids.at(-1), down ? ids.at(-1) : ids[0]);
  };

  const schedule = () => {
    raf ||= requestAnimationFrame(tick);
  };

  /** Скорость прокрутки: чем ближе указатель к краю (или дальше за ним), тем быстрее. */
  const speed = () => {
    const rect = scroller?.getBoundingClientRect();
    const top = Math.max(0, rect?.top ?? 0);
    const bottom = Math.min(window.innerHeight, rect?.bottom ?? window.innerHeight);

    if (y < top + EDGE) return -Math.min(MAX_SPEED, 2 + (top + EDGE - y) / 3);
    if (y > bottom - EDGE) return Math.min(MAX_SPEED, 2 + (y - (bottom - EDGE)) / 3);

    return 0;
  };

  function tick() {
    const step = speed();

    if (step !== 0) {
      if (scroller) scroller.scrollTop += step;
      else window.scrollBy(0, step);
    }

    update();

    // Пока указатель у края, документ прокручивается дальше даже без движения мыши.
    if (step !== 0) schedule();
  }

  schedule();

  return {
    move(nextX, nextY) {
      x = nextX;
      y = nextY;
      schedule();
    },

    end() {
      cancelAnimationFrame(raf);
      frame.remove();

      const { ids, anchor: first, focus: last } = view.picked.getState();

      if (ids.length > 0) pickRun(view, ids, first ?? undefined, last ?? undefined);
    },
  };
}
