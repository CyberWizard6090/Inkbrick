import type { BlockId } from '@inkbrick/document';

import type { Command, CommandContext } from './Command';
import { DeleteBlockCommand } from './DeleteBlockCommand';

/**
 * Блоки, которые можно удалить. Закреплённый блок (`engine.pinned`) и его предки пропускаются: по одному их удаление
 * отклонялось бы командой за командой, а пачка из-за них не должна отклоняться целиком.
 */
function deletableOf(context: CommandContext, ids: readonly BlockId[]): BlockId[] {
  const { engine, transaction } = context;
  const kept = new Set<BlockId>();

  for (
    let block = engine.pinned ? transaction.getBlock(engine.pinned.id) : undefined;
    block;
    block = block.parentId ? transaction.getBlock(block.parentId) : undefined
  ) {
    kept.add(block.id);
  }

  return ids.filter((id) => !kept.has(id) && DeleteBlockCommand.canExecute(context, { id }));
}

/**
 * Удаляет сразу несколько блоков с потомками — например, все выбранные блоки. То же, что `delete-block` для каждого
 * (блоки, которые удалить нельзя, пропускаются; в опустевшем контейнере появляется пустой абзац), но соседи одного
 * родителя убираются одним изменением: удаление и отмена тысяч блоков не растут квадратично.
 */
export const DeleteBlocksCommand: Command<{ ids: readonly BlockId[] }, void> = {
  type: 'delete-blocks',

  canExecute(context, { ids }) {
    return Array.isArray(ids) && deletableOf(context, ids).length > 0;
  },

  execute(context, { ids }) {
    const { engine, transaction } = context;
    const deletable = deletableOf(context, ids);
    const parents = new Set(deletable.map((id) => transaction.getBlock(id)?.parentId));

    engine.block.removeMany(transaction, deletable);

    for (const parentId of parents) {
      const parent = parentId ? transaction.getBlock(parentId) : undefined;
      const fill = parent && engine.schema.getBlockSchema(parent.flavour)?.fillWhenEmpty;

      if (parent && fill && parent.children.length === 0) {
        engine.block.insert(
          transaction,
          parent.id,
          0,
          engine.block.create({ flavour: fill, parentId: parent.id }),
        );
      }
    }
  },
};
