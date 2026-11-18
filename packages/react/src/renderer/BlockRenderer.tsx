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
const MAX_ANIMATED_FOLD = 40;

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
  const picked = useSyncExternalStore(
    view.picked.subscribe,
    () => view.picked.has(id),
    () => false,
  );
  const block = useBlock(id);

  // Блок, который скрыл свёрнутый заголовок, не пропадает сразу: пока идёт анимация, он ещё нарисован (`gone` — он уже ушёл).
  const [gone, setGone] = useState(folded);
  const wasFolded = useRef(folded);

  if (!folded && gone) setGone(false);

  // Блок выбран целиком (Esc, рамка): отметка ставится на его элемент, компоненты блоков про неё не знают.
  useLayoutEffect(() => {
    const element = view
      .getRoot()
      ?.querySelector(`[data-block-id="${id.replace(/["\\]/g, '\\$&')}"]`);

    element?.toggleAttribute('data-picked', picked);
  }, [view, id, picked, block]);

  // Сворачивание и разворачивание заголовка: блок плавно уходит или появляется (на его собственном корне, без обёртки).
  useLayoutEffect(() => {
    const before = wasFolded.current;

    wasFolded.current = folded;

    if (before === folded) return;

    const element = view
      .getRoot()
      ?.querySelector<HTMLElement>(`[data-block-id="${id.replace(/["\\]/g, '\\$&')}"]`);
    // Раздел из сотен блоков двигать нельзя: каждый анимировался бы сам. Он сворачивается сразу.
    const animated = !!element && view.folds.changed <= MAX_ANIMATED_FOLD;

    if (folded) {
      if (!animated || !animateCollapse(element, 'closed', () => setGone(true))) setGone(true);
    } else if (animated) {
      animateCollapse(element, 'open');
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
