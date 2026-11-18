import type { RefObject } from 'react';

import { useReadOnly } from '../hooks/useReadOnly';
import { lazyModule, useLazy } from '../ui/lazy';

const layer = lazyModule(() =>
  import('./BlockHandleLayer').then((module) => module.BlockHandleLayer),
);

/**
 * Ленивый слой ручки блока: чанк (слежение за указателем, ручка, меню, перенос, линия вставки) грузится сразу после
 * монтирования редактора, который можно править, и ничего не весит в начальном бандле. Пока он не пришёл, ручки нет:
 * показывать её нужно только при наведении, а чанк приходит раньше первого движения мыши.
 */
export function LazyBlockHandles({
  rootRef,
  handles,
}: {
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly handles: boolean;
}) {
  const readOnly = useReadOnly();
  const Layer = useLazy(layer, !readOnly);

  if (readOnly || !Layer) return null;

  return <Layer rootRef={rootRef} handles={handles} />;
}
