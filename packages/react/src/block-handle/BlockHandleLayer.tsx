import type { RefObject } from 'react';

import { BlockHandleHost } from './BlockHandleHost';
import { DropIndicatorHost } from './DropIndicatorHost';
import { useBlockHandles } from './useBlockHandles';

export interface BlockHandleLayerProps {
  /** Корень документа: за указателем над ним следит `useBlockHandles`. */
  readonly rootRef: RefObject<HTMLElement | null>;
  /** Нужна ли встроенная ручка (`slots.BlockHandle !== null`); линия вставки рисуется и без неё. */
  readonly handles: boolean;
}

/**
 * Всё, что связано с ручкой и переносом блоков: слежение за указателем, ручка, меню блока, линия вставки.
 * Это отдельный чанк (см. `LazyBlockHandles`): в ядро редактора он не входит.
 */
export function BlockHandleLayer({ rootRef, handles }: BlockHandleLayerProps) {
  useBlockHandles(rootRef, handles);

  return (
    <>
      <BlockHandleHost />
      <DropIndicatorHost />
    </>
  );
}
