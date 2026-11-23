import type { Transaction } from '@inkbrick/store';

import type { Engine } from '../editor/Engine';

/**
 * Обработка после каждой выполненной команды, в той же транзакции: привести структуру в порядок (убрать опустевшие
 * колонки) или проверить инвариант (закреплённый блок на месте). Исключение откатывает всю команду.
 */
export type AfterCommand = (engine: Engine, transaction: Transaction) => void;

/** Команда сняла бы закреплённый блок: транзакция откатывается, `dispatch` возвращает `undefined`. */
export class PinnedBlockError extends Error {
  constructor(id: string) {
    super(`Block "${id}" is pinned and cannot be removed or moved`);
  }
}

/** Закреплённый блок (`editor.pin`) остался на месте, с тем же типом и родителем. */
export const assertPinned: AfterCommand = (engine, transaction) => {
  const { pinned } = engine;

  if (!pinned) return;

  const block = transaction.getBlock(pinned.id);

  if (!block || block.flavour !== pinned.flavour || block.parentId !== pinned.parentId) {
    throw new PinnedBlockError(pinned.id);
  }
};
