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

  useEffect(() => (windowed ? view.viewport.attach() : undefined), [view, windowed]);

  const offsets = useMemo(() => {
    if (!windowed) return null;

    const result = new Float64Array(ids.length + 1);
    const getBlock = (id: BlockId) => editor.store.getBlock(id);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      let height = heights.get(id) ?? estimates.get(id);

      if (height === undefined) {
        height = estimateSubtree(getBlock, id, options.estimateHeight);
        estimates.set(id, height);
      }

      result[i + 1] = result[i] + height;
    }

    return result;
    // measured — версия изменяемой карты heights
  }, [ids, windowed, measured, heights, estimates, editor, options.estimateHeight]);

  const rendered = useMemo(() => {
    if (!offsets) return null;

    const last = ids.length - 1;
    const from = Math.max(0, upperBound(offsets, range.top - options.overscan) - 1);
    const to = Math.min(
      last,
      upperBound(offsets, range.bottom + options.overscan) - 1,
      from + options.maxRendered - 1,
    );
    const pinned = new Set<number>([0, last]);

    for (const id of [...view.viewport.getPinned(), dragId, dropId]) {
      if (id) pinned.add(indexOfItem(editor, parentId, ids, id));
    }

    pinned.delete(-1);

    const result: number[] = [];

    for (const i of [...pinned].sort((a, b) => a - b)) if (i < from) result.push(i);
    for (let i = from; i <= to; i++) result.push(i);
    for (const i of [...pinned].sort((a, b) => a - b)) if (i > to) result.push(i);

    return result;
    // pins — версия view.viewport: getPinned() меняется вместе с ней
  }, [offsets, ids, range, options, view, editor, parentId, dragId, dropId, pins]);

  const observer = useRef<ResizeObserver | null>(null);
  const observed = useRef(new Map<Element, number>());

  useLayoutEffect(() => {
    if (!windowed || !rendered || !marker.current) return;

    const seen = new Set<Element>();
    const expected = new Set(rendered.map((i) => ids[i]));
    let changed = false;
    let previous: { id: BlockId; top: number; height: number } | null = null;
    let remaining = rendered.length;

    const settle = (height: number) => {
      if (!previous) return;
      // Элемент без раскладки (скрыт, jsdom) не измеряем: остаётся оценка.
      if (height > 0 && Math.abs((heights.get(previous.id) ?? -1) - height) > 0.5) {
        heights.set(previous.id, height);
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

    const next = visibleRange(marker.current, parents.current);
    const step = options.overscan / 4;

    setRange((current) =>
      Math.abs(current.top - next.top) < step && Math.abs(current.bottom - next.bottom) < step
        ? current
        : next,
    );

    if (changed) remeasure();
  });

  useEffect(() => () => observer.current?.disconnect(), []);

  useEffect(() => {
    if (!windowed || !marker.current) return;

    parents.current = scrollParents(marker.current);

    let frame = 0;
    const step = options.overscan / 4;

    const onScroll = () => {
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
  }, [windowed, options.overscan]);

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
    if (i > next) items.push(<Spacer key={`gap:${next}`} height={offsets[i] - offsets[next]} />);
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
