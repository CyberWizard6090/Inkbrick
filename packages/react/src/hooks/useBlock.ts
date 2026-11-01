import { useCallback, useSyncExternalStore } from 'react';

import type { BlockId } from '@inkbrick/document';

import { useEditor } from './useEditor';

/**
 * Подписывается на один блок. Блоки в документе иммутабельны (каждое изменение
 * создаёт новый объект), поэтому ссылка — корректный snapshot для React.
 */
export function useBlock(id: BlockId) {
  const { store } = useEditor();

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeBlock(id, listener),
    [store, id],
  );
  const getSnapshot = useCallback(() => store.getBlock(id), [store, id]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
