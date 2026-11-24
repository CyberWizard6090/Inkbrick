import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { BlockId } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import { useEditor } from '../../hooks/useEditor';
import { selectionEdges } from '../../editing/useSelectionState';
import { useEditorView } from '../../hooks/useEditorView';
import { BlockRenderer } from '../BlockRenderer';
import type { ChildListProps } from '../DocumentRenderer';
import { estimateSubtree, type BlockHeightEstimate } from './estimate';

export interface ResolvedVirtualOptions {
  readonly threshold: number;
  readonly overscan: number;
  readonly maxRendered: number;
  readonly estimateHeight: BlockHeightEstimate;
}

interface Range {
  readonly top: number;
  readonly bottom: number;
}

const SPACER = 'data-inkbrick-spacer';

function upperBound(offsets: Float64Array, value: number): number {
  let lo = 0;
  let hi = offsets.length;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;

    if (offsets[mid] <= value) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

function scrollParents(element: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];

  for (
    let node = element.parentElement;
    node && node !== document.body && node !== document.documentElement;
    node = node.parentElement
  ) {
    if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(node).overflowY)) result.push(node);
  }

  return result;
}

/** Сколько перемеров подряд делается в одном коммите, прежде чем следующий откладывается на кадр. */
const MAX_SYNC_PASSES = 8;

function visibleRange(marker: HTMLElement, parents: readonly HTMLElement[]): Range {
  let top = 0;
  let bottom = window.innerHeight;

  for (const parent of parents) {
    const rect = parent.getBoundingClientRect();

    top = Math.max(top, rect.top);
    bottom = Math.min(bottom, rect.bottom);
  }

  const origin = marker.getBoundingClientRect().top;

  return { top: top - origin, bottom: Math.max(top, bottom) - origin };
}

function indexOfItem(
  editor: Editor,
  parentId: BlockId,
  ids: readonly BlockId[],
  id: BlockId,
): number {
  let block = editor.store.getBlock(id);

  while (block && block.parentId !== parentId) {
    block = block.parentId ? editor.store.getBlock(block.parentId) : undefined;
  }

  return block ? ids.indexOf(block.id) : -1;
}

function Spacer({ height }: { readonly height: number }) {
  return (
    <div
      className="inkbrick-spacer"
      data-inkbrick-spacer=""
      aria-hidden="true"
      contentEditable={false}
      style={{ height }}
    />
  );
}

/**
 * Дети контейнера с окном отрисовки: в DOM — блоки около видимой области, первый и последний блок (для Ctrl+A),
 * края выделения, перетаскиваемый блок и запрошенные редактором (`view.viewport`); остальные заменены
 * распорками. Высота отрисованного блока измеряется (вместе с отступом до следующего), неотрисованного — оценивается.
 * Короткие списки (меньше `threshold`) рисуются целиком теми же элементами, поэтому переход порога ничего не
 * пересоздаёт.
 */
export function VirtualChildList({
  parentId,
  ids,
  options,
}: ChildListProps & { readonly options: ResolvedVirtualOptions }) {
  const editor = useEditor();
  const view = useEditorView();
  const windowed = ids.length >= options.threshold;
  const marker = useRef<HTMLDivElement>(null);
  const parents = useRef<HTMLElement[]>([]);
  // Измеренные высоты блоков и оценки неотрисованных (оценка не обновляется, пока блок не отрисуют и не измерят).
  const [heights] = useState(() => new Map<BlockId, number>());
  const [estimates] = useState(() => new Map<BlockId, number>());
  const [measured, remeasure] = useReducer((n: number) => n + 1, 0);
  const [range, setRange] = useState<Range>(() => ({
    top: 0,
    bottom: typeof window === 'undefined' ? 1000 : window.innerHeight,
  }));

  const pins = useSyncExternalStore(
    view.viewport.subscribe,
    view.viewport.getVersion,
    view.viewport.getVersion,
  );
  const dragId = useSyncExternalStore(
    view.blocks.subscribe,
    () => view.blocks.getState().drag?.blockId ?? null,
    () => null,
  );
  const dropId = useSyncExternalStore(
    view.blocks.subscribe,
    () => view.blocks.getState().drag?.targetId ?? null,
    () => null,
  );

  // Свёрнутые заголовком блоки не занимают места: ни в оценке высоты, ни в окне отрисовки.
  const foldVersion = useSyncExternalStore(
    view.folds.subscribeAll,
    () => view.folds.version,
    () => 0,
  );

  useEffect(() => (windowed ? view.viewport.attach() : undefined), [view, windowed]);

  // Рендерер рисует только блоки у экрана: анимации сворачивания разделов ограничены тем, что на странице.
  useLayoutEffect(() => {
    view.folds.windowed = windowed;

    return () => {
      view.folds.windowed = false;
    };
  }, [view, windowed]);

  // Прошлый расчёт: высоты по позициям в `ids`. Правка меняет обычно один-два блока, а не 50 000: общее начало и конец
  // списка берутся отсюда, заново считаются только изменившаяся середина и перемеренные блоки.
  const sizesCache = useRef<{
    readonly ids: readonly BlockId[];
    readonly foldVersion: number;
    readonly sizes: Float64Array;
    readonly offsets: Float64Array;
  } | null>(null);
  // Блоки, высоту которых перемерили после прошлого расчёта.
  const remeasured = useRef(new Set<BlockId>());
  // Места отрисованных блоков в `ids` при прошлом расчёте окна: перемеряют только их.
  const positions = useRef(new Map<BlockId, number>());

  const offsets = useMemo(() => {
    if (!windowed) {
      sizesCache.current = null;
      return null;
    }

    const getBlock = (id: BlockId) => editor.store.getBlock(id);
    const sizeOf = (id: BlockId) => {
      // Свёрнутые заголовком блоки не занимают места.
      if (view.folds.isHidden(id)) return 0;

      let height = heights.get(id) ?? estimates.get(id);

      if (height === undefined) {
        height = estimateSubtree(getBlock, id, options.estimateHeight);
        estimates.set(id, height);
      }

      return height;
    };
    const sizes = new Float64Array(ids.length);
    const previous = sizesCache.current;
    // С какого места высоты могли измениться: до него суммы берутся из прошлого расчёта.
    let firstChanged = 0;

    if (previous && previous.foldVersion === foldVersion) {
      const old = previous.ids;
      const shared = Math.min(old.length, ids.length);
      let start = 0;
      let end = 0;

      while (start < shared && old[start] === ids[start]) start++;
      while (end < shared - start && old[old.length - 1 - end] === ids[ids.length - 1 - end]) end++;

      sizes.set(previous.sizes.subarray(0, start), 0);
      if (end > 0) sizes.set(previous.sizes.subarray(old.length - end), ids.length - end);
      for (let i = start; i < ids.length - end; i++) sizes[i] = sizeOf(ids[i]);

      firstChanged = start;

      // Перемеряют отрисованные блоки — они у окна: место ищем по прошлой позиции (с учётом сдвига вставкой или
      // удалением), а не перебором всех 50 000.
      const shift = ids.length - old.length;

      for (const id of remeasured.current) {
        const before = positions.current.get(id);
        const index =
          before !== undefined && ids[before] === id
            ? before
            : before !== undefined && ids[before + shift] === id
              ? before + shift
              : ids.indexOf(id);

        if (index === -1) continue;

        const size = sizeOf(id);

        if (sizes[index] !== size) {
          sizes[index] = size;
          firstChanged = Math.min(firstChanged, index);
        }
      }
    } else {
      for (let i = 0; i < ids.length; i++) sizes[i] = sizeOf(ids[i]);
    }

    remeasured.current.clear();

    // Ничего не изменилось (перемер дал те же высоты): прежние суммы, и окно отрисовки не пересчитывается.
    if (previous && previous.ids === ids && firstChanged === ids.length) return previous.offsets;

    const result = new Float64Array(ids.length + 1);

    if (previous && firstChanged > 0) result.set(previous.offsets.subarray(0, firstChanged + 1));
    else firstChanged = 0;

    for (let i = firstChanged; i < ids.length; i++) result[i + 1] = result[i] + sizes[i];

    sizesCache.current = { ids, foldVersion, sizes, offsets: result };

    return result;
    // measured — версия изменяемой карты heights, foldVersion — набор свёрнутых блоков
  }, [
    ids,
    windowed,
    measured,
    foldVersion,
    heights,
    estimates,
    editor,
    view,
    options.estimateHeight,
  ]);

  const rendered = useMemo(() => {
    if (!offsets) return null;

    const last = ids.length - 1;
    const from = Math.max(0, upperBound(offsets, range.top - options.overscan) - 1);
    const to = Math.min(last, upperBound(offsets, range.bottom + options.overscan) - 1);
    const pinned = new Set<number>([0, last]);

    for (const id of [...view.viewport.getPinned(), dragId, dropId, ...view.folds.leavingIds()]) {
      if (id) pinned.add(indexOfItem(editor, parentId, ids, id));
    }

    pinned.delete(-1);

    // Скрытый заголовком блок, который ещё уходит с анимацией, пока рисуется: иначе анимации не видно.
    const shown = (i: number) => !view.folds.isHidden(ids[i]) || view.folds.isLeaving(ids[i]);

    // Лимит окна считает отрисованные блоки, а не индексы: свёрнутый раздел из сотен скрытых блоков не должен
    // выталкивать из окна блоки, которые стоят на экране сразу за ним.
    const inWindow: number[] = [];

    for (let i = from; i <= to && inWindow.length < options.maxRendered; i++) {
      if (shown(i)) inWindow.push(i);
    }

    const taken = new Set(inWindow);
    const extra = [...pinned].filter((i) => shown(i) && !taken.has(i)).sort((a, b) => a - b);
    const list = [...extra.filter((i) => i < from), ...inWindow, ...extra.filter((i) => i >= from)];

    positions.current = new Map(list.map((i) => [ids[i], i]));

    return list;
    // pins — версия view.viewport: getPinned() меняется вместе с ней
  }, [offsets, ids, range, options, view, editor, parentId, dragId, dropId, pins, foldVersion]);

  const observer = useRef<ResizeObserver | null>(null);
  const observed = useRef(new Map<Element, number>());
  // Перемеры подряд в одном коммите и отложенный на кадр перемер (см. конец эффекта ниже).
  const passes = useRef(0);
  const deferred = useRef(0);

  useLayoutEffect(() => {
    if (!windowed || !rendered || !marker.current) return;

    const seen = new Set<Element>();
    // Блок, который сейчас сжимается или растёт, не измеряем: его высота временная. Измерим, когда анимация закончится.
    const expected = new Set(
      rendered.map((i) => ids[i]).filter((id) => !view.folds.isAnimating(id)),
    );
    let changed = false;
    let previous: { id: BlockId; top: number; height: number } | null = null;
    let remaining = rendered.length;

    const settle = (height: number) => {
      if (!previous) return;
      // Элемент без раскладки (скрыт, jsdom) не измеряем: остаётся оценка.
      if (height > 0 && Math.abs((heights.get(previous.id) ?? -1) - height) > 0.5) {
        heights.set(previous.id, height);
        remeasured.current.add(previous.id);
        changed = true;
      }
      previous = null;
    };

    for (
      let element = marker.current.nextElementSibling;
      element && remaining > 0;
      element = element.nextElementSibling
    ) {
      const rect = element.getBoundingClientRect();

      if (previous) settle(rect.top - previous.top);
      if (element.hasAttribute(SPACER)) continue;

      remaining -= 1;

      const id = element.getAttribute('data-block-id');

      if (id && expected.has(id)) {
        previous = { id, top: rect.top, height: rect.height };
        seen.add(element);
      }
    }

    if (previous) settle((previous as { height: number }).height);

    if (typeof ResizeObserver !== 'undefined') {
      const sizes = observed.current;

      observer.current ??= new ResizeObserver((entries) => {
        let resized = false;

        for (const entry of entries) {
          const size = entry.contentRect.height;
          const known = sizes.get(entry.target);

          // Первое уведомление приходит сразу после observe — это не изменение.
          if (known !== undefined && Math.abs(known - size) > 0.5) resized = true;
          sizes.set(entry.target, size);
        }

        if (resized) remeasure();
      });

      for (const element of [...sizes.keys()]) {
        if (!seen.has(element)) {
          observer.current.unobserve(element);
          sizes.delete(element);
        }
      }

      for (const element of seen) {
        if (!sizes.has(element)) observer.current.observe(element);
      }
    }

    // Пока блоки сворачиваются или разворачиваются, их высота временная, а раскладка в DOM расходится с моделью высот.
    // Окно и перемер не пересчитываем: на каждый коммит они дёргались бы заново (бесконечный цикл обновлений). Когда
    // анимация кончится, контроллер разбудит список, и всё пересчитается по настоящим высотам.
    if (view.folds.isMoving) return;

    const next = visibleRange(marker.current, parents.current);
    const step = options.overscan / 4;

    setRange((current) =>
      Math.abs(current.top - next.top) < step && Math.abs(current.bottom - next.bottom) < step
        ? current
        : next,
    );

    if (!changed) {
      passes.current = 0;

      return;
    }

    // Блоки намного ниже оценки (например, картинки до загрузки): после каждого замера в окно входит ещё один блок, и
    // перемер тянет следующий. Синхронно — не больше нескольких проходов подряд (иначе React обрывает цикл ошибкой
    // «Maximum update depth exceeded»), остальные — по одному на кадр.
    if (passes.current < MAX_SYNC_PASSES) {
      passes.current += 1;
      remeasure();
    } else if (!deferred.current) {
      deferred.current = requestAnimationFrame(() => {
        deferred.current = 0;
        passes.current = 0;
        remeasure();
      });
    }
  });

  useEffect(() => () => cancelAnimationFrame(deferred.current), []);

  useEffect(() => () => observer.current?.disconnect(), []);

  useEffect(() => {
    if (!windowed || !marker.current) return;

    parents.current = scrollParents(marker.current);

    let frame = 0;
    const step = options.overscan / 4;

    const onScroll = () => {
      // `selectionchange` приходит отдельной задачей и может отстать от прокрутки: блок с кареткой успел бы
      // выгрузиться, а вместе с ним пропало бы выделение. Края читаем здесь, до перерисовки окна.
      const root = view.getRoot();

      if (root) view.viewport.setEdges(selectionEdges(root));
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!marker.current) return;

        const next = visibleRange(marker.current, parents.current);

        setRange((current) =>
          Math.abs(current.top - next.top) < step && Math.abs(current.bottom - next.bottom) < step
            ? current
            : next,
        );
      });
    };

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, [windowed, options.overscan, view]);

  if (!rendered || !offsets) {
    return (
      <>
        {null}
        {ids.map((id) => (
          <BlockRenderer key={id} id={id} />
        ))}
      </>
    );
  }

  const items: ReactNode[] = [];
  let next = 0;

  for (const i of rendered) {
    if (i > next && offsets[i] - offsets[next] > 0) {
      items.push(<Spacer key={`gap:${next}`} height={offsets[i] - offsets[next]} />);
    }
    items.push(<BlockRenderer key={ids[i]} id={ids[i]} />);
    next = i + 1;
  }

  return (
    <>
      <div
        ref={marker}
        className="inkbrick-spacer"
        data-inkbrick-spacer="start"
        aria-hidden="true"
        contentEditable={false}
      />
      {items}
    </>
  );
}
