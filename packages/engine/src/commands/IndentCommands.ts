import type { Command } from './Command';
import type { BlockTargetPayload } from '../dispatcher/Intents';
import { canOutdent, outdent } from './outdent';

/**
 * Tab: делает блок дочерним для предыдущего соседнего блока. Вкладывать можно только блоки,
 * которые схема помечает как `indentable` (пункты списка): иначе обычный параграф «проваливался» бы в список.
 */
export const IndentBlockCommand: Command<BlockTargetPayload, void> = {
  type: 'indentBlock',

  canExecute({ engine, transaction }, { blockId }) {
    const block = transaction.getBlock(blockId);
    if (!block?.parentId) return false;
    if (engine.schema.getBlockSchema(block.flavour)?.indentable !== true) return false;

    const parent = transaction.getBlock(block.parentId);
    const index = parent?.children.indexOf(blockId) ?? -1;
    if (!parent || index <= 0) return false;

    const sibling = transaction.getBlock(parent.children[index - 1]);

    return (
      !!sibling &&
      engine.schema.validateRelation(sibling.flavour, block.flavour) &&
      engine.block.fitsDepth(transaction, sibling.id, blockId)
    );
  },

  execute({ engine, transaction }, { blockId }) {
    const block = transaction.getBlock(blockId)!;
    const parent = transaction.getBlock(block.parentId!)!;
    const sibling = transaction.getBlock(parent.children[parent.children.indexOf(blockId) - 1])!;

    engine.block.move(transaction, blockId, sibling.id, sibling.children.length);
  },
};

export const OutdentBlockCommand: Command<BlockTargetPayload, void> = {
  type: 'outdentBlock',

  canExecute(context, { blockId }) {
    const block = context.transaction.getBlock(blockId);

    return !!block && canOutdent(context, block);
  },

  execute(context, { blockId }) {
    outdent(context, blockId);
  },
};
