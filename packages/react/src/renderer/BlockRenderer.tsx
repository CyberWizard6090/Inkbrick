import { memo, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { BlockId } from '@inkbrick/document';

import { BlockChildren } from '../blocks/BlockChildren';
import { UnknownBlockView } from '../blocks/UnknownBlockView';
import { useBlock } from '../hooks/useBlock';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { resolveBlockComponent } from '../registry/resolveBlockComponent';
import { animateCollapse } from '../ui/collapse';
import { useEditorUI } from '../ui/EditorUIContext';

export interface BlockRendererProps {
  readonly id: BlockId;
}

const warned = new Set<string>();

/** Больше стольких блоков за раз раздел сворачивается и разворачивается без анимации. */
const MAX_ANIMATED_FOLD = 200;

/**
 * Блок на экране или рядом с ним (в пределах половины высоты окна): только такие сворачиваются плавно. Блоки дальше от
 * экрана уходят сразу — разницы не видно, а большой раздел не анимирует десятки невидимых блоков.
 */
function nearViewport(element: HTMLElement): boolean {
  const { top, bottom } = element.getBoundingClientRect();
  const height = globalThis.innerHeight || 0;

  return height === 0 || (bottom >= -height / 2 && top <= height * 1.5);
}

export const BlockRenderer = memo(function BlockRenderer({ id }: BlockRendererProps) {
  const editor = useEditor();
  const view = useEditorView();
  const readOnly = useReadOnly();
  const { components, slots } = useEditorUI();
  const selected = useSyncExternalStore(
    view.selection.subscribe,
    () => view.selection.isSelected(id),
    () => false,
  );
  const subscribeFolds = useMemo(() => view.folds.subscribe(id), [view, id]);
  const folded = useSyncExternalStore(
    subscribeFolds,
    () => view.folds.isHidden(id),
    () => false,
  );
  const block = useBlock(id);

  // Блок, который скрыл свёрнутый заголовок, не пропадает сразу: пока идёт анимация, он ещё нарисован (`gone` — он уже ушёл).
  const [gone, setGone] = useState(folded);
  const wasFolded = useRef(folded);
  const started = useRef(false);

  if (!folded && gone) setGone(false);

  // Блок выбран целиком (Esc, рамка): отметку на уже нарисованные блоки ставит `view.picked` одним проходом, без подписки
  // каждого блока. Здесь — только блок, который появился (прокрутка, смена типа) уже при выборе.
  const flavour = block?.flavour;

  useLayoutEffect(() => {
    if (view.picked.size === 0 || !view.picked.has(id)) return;

    view
      .getRoot()
      ?.querySelector(`[data-block-id="${id.replace(/["\\]/g, '\\$&')}"]`)
      ?.setAttribute('data-picked', '');
  }, [view, id, flavour]);

  useLayoutEffect(() => view.folds.register(id), [view, id]);

  // Сворачивание и разворачивание заголовка: блок плавно уходит или появляется (на его собственном корне, без обёртки).
  useLayoutEffect(() => {
    const first = !started.current;
    const before = wasFolded.current;

    started.current = true;
    wasFolded.current = folded;

    // Элемент и его место на экране нужны только для анимации сворачивания: при обычном монтировании их не трогаем —
    // чтение геометрии у каждого из тысяч новых блоков (таблица, вставка) заставляло браузер пересчитывать раскладку.
    const elementOf = () =>
      view
        .getRoot()
        ?.querySelector<HTMLElement>(`[data-block-id="${id.replace(/["\\]/g, '\\$&')}"]`) ??
      undefined;
    // Раздел из сотен блоков двигать нельзя: каждый анимировался бы сам. Он сворачивается сразу. В разделе поменьше плавно
    // двигаются только блоки у экрана.
    const animatable = () => {
      if (!view.folds.canAnimate(MAX_ANIMATED_FOLD)) return undefined;

      const element = elementOf();

      return element && nearViewport(element) ? element : undefined;
    };

    const appear = () => {
      const element = animatable();

      if (!element) return;

      view.folds.setMoving(id, false);

      if (!animateCollapse(element, 'open', () => view.folds.setMoving(id, null))) {
        view.folds.setMoving(id, null);
      }
    };

    // Блок смонтирован уже после разворачивания раздела (виртуальный рендерер рисует его только сейчас): появляется плавно.
    if (first) {
      if (!folded && view.folds.consumeRevealed(id)) appear();

      return;
    }

    if (before === folded) return;

    if (!folded) {
      appear();

      return;
    }

    const element = animatable();
    const leaving =
      !!element &&
      animateCollapse(element, 'closed', () => {
        view.folds.setMoving(id, null);
        setGone(true);
      });

    if (!leaving) {
      view.folds.setMoving(id, null);
      setGone(true);
    }
  }, [view, id, folded]);

  if (!block || (folded && gone)) {
    return null;
  }

  const Component = resolveBlockComponent(block.flavour, components);

  if (Component) {
    return (
      <Component
        block={block}
        editor={editor}
        selected={selected}
        readOnly={readOnly}
        controller={editor.controllers.get(block.flavour)}
      />
    );
  }

  // Неизвестный тип блока не должен ронять редактор и не должен подменяться другим типом.
  if (!warned.has(block.flavour)) {
    warned.add(block.flavour);
    console.warn(`[@inkbrick/react] No component registered for block "${block.flavour}"`);
  }

  const Fallback = slots.UnknownBlock ?? UnknownBlockView;

  return (
    <Fallback block={block} editor={editor} selected={selected} readOnly={readOnly}>
      <BlockChildren id={block.id} />
    </Fallback>
  );
});
