import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';

/**
 * Модуль грузится отдельным чанком (сразу после отрисовки редактора) и ничего не импортирует во время выполнения:
 * общий с ядром код сборщик вынес бы в ещё один чанк. Поэтому тип колонок и «выбор без каретки» — здесь, а не импортом.
 */
const COLUMNS = 'block:columns';

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

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const crosses = (a: Box, b: Box) =>
  a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

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
    const found: {
      id: string;
      top: number;
      bottom: number;
      left: number;
      right: number;
      element: Element;
    }[] = [];

    for (const element of root.querySelectorAll('[data-block-id]')) {
      const id = element.getAttribute('data-block-id')!;

      if (editor.store.getBlock(id)?.parentId !== note) continue;

      const rect = element.getBoundingClientRect();

      if (rect.height > 0) {
        found.push({
          id,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          element,
        });
      }
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
    const picked = touched(ids, list, {
      left: Math.min(origin.x, x),
      right: Math.max(origin.x, x),
      top,
      bottom,
    });

    view.picked.set(picked, down ? picked[0] : picked.at(-1), down ? picked.at(-1) : picked[0]);
  };

  /**
   * Из блоков, которые рамка проходит по высоте, оставляет те, которые она задевает и по ширине: рамка, которую тянут
   * по полю страницы, ничего не выбирает, пока не дошла до текста. Рамка внутри одной колонки выбирает блоки этой
   * колонки (их и переносят, и удаляют вместе); рамка через несколько колонок — весь блок колонок.
   */
  const touched = (
    ids: readonly string[],
    list: ReturnType<typeof rows>,
    box: Box,
  ): readonly string[] => {
    const result: string[] = [];
    const inner = new Map<string, string[]>();
    // Нарисованные блоки уже измерены (`rows`): здесь — без новых обращений к DOM на каждый блок.
    const drawn = new Map(list.map((row) => [row.id, row]));
    // Ширина текста (для блоков вне экрана) — по любому нарисованному блоку.
    const width = list[0];

    if (width && (box.right < width.left || box.left > width.right)) return [];

    for (const id of ids) {
      const row = drawn.get(id);

      // Блок вне экрана (виртуальный рендер, автопрокрутка): он целиком между краями рамки по высоте.
      if (!row) {
        result.push(id);
        continue;
      }

      if (box.right < row.left || box.left > row.right) continue;

      if (editor.store.getBlock(id)?.flavour !== COLUMNS) {
        result.push(id);
        continue;
      }

      for (const column of editor.store.getBlock(id)!.children) {
        const blocks = (editor.store.getBlock(column)?.children ?? []).filter((child) => {
          const node = row.element.querySelector(`[data-block-id="${CSS.escape(child)}"]`);

          return !!node && crosses(box, node.getBoundingClientRect());
        });

        if (blocks.length > 0) inner.set(`${id}/${column}`, blocks);
      }

      if ([...inner.keys()].some((key) => key.startsWith(`${id}/`))) result.push(id);
    }

    // Задеты блоки одной колонки и больше ничего — выбираем их, а не блок колонок.
    if (result.length === 1 && inner.size === 1) return [...inner.values()][0];

    return result;
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
      // Кадр с последним положением указателя мог не успеть выполниться: выбор считаем по нему сейчас, иначе отпущенная
      // сразу после движения рамка теряет последние задетые блоки.
      if (raf) {
        cancelAnimationFrame(raf);
        update();
      }

      frame.remove();

      const { ids, anchor: first, focus: last } = view.picked.getState();

      if (ids.length === 0) return;

      // Как `pickRun`: выбор цельным рядом, каретка убрана, фокус остаётся в корне (клавиши работают дальше).
      view.picked.set(ids, first ?? undefined, last ?? undefined);
      if (globalThis.document.activeElement !== root) root.focus({ preventScroll: true });
      globalThis.getSelection()?.removeAllRanges();
    },
  };
}
