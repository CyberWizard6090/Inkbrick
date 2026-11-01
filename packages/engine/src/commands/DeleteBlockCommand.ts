import type { BlockId } from '@inkbrick/document';

import type { Command } from './Command';

/**
 * Удаляет блок с потомками. Корневую страницу и заметку (основной контейнер текста)
 * удалять нельзя. Если удалён последний блок заметки, на его месте появляется пустой
 * параграф — в документе всегда остаётся место для ввода.
 */
export const DeleteBlockCommand: Command<{ id: BlockId }, void> = {
  type: 'delete-block',

  canExecute({ engine, transaction }, { id }) {
    const block = transaction.getBlock(id);

    if (!block || id === engine.store.document.rootId) return false;

    return block.flavour !== 'block:note';
  },

  execute({ engine, transaction }, { id }) {
    const parentId = transaction.getBlock(id)!.parentId;

    engine.block.remove(transaction, id);

    const parent = parentId ? transaction.getBlock(parentId) : undefined;

    if (parent && parent.children.length === 0 && parent.flavour === 'block:note') {
      engine.block.insert(
        transaction,
        parent.id,
        0,
        engine.block.create({ flavour: 'block:paragraph', parentId: parent.id }),
      );
    }
  },
};
