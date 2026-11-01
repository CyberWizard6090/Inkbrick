import type { BlockId } from '@inkbrick/document';

import { useBlock } from './useBlock';

const NO_CHILDREN: readonly BlockId[] = [];

/**
 * Идентификаторы дочерних блоков. Возвращает стабильную ссылку, пока children
 * не изменились (создавать новый массив в getSnapshot нельзя — это приводит
 * к бесконечному циклу рендера в useSyncExternalStore).
 */
export function useChildren(parentId: BlockId): readonly BlockId[] {
  const parent = useBlock(parentId);

  return parent?.children ?? NO_CHILDREN;
}
