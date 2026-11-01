import type { BaseBlock, BlockId } from '@inkbrick/document';
import type { Transaction } from '@inkbrick/store';

import type { Command, CommandContext } from './Command';
import type { CaretResult, BlockTargetPayload } from '../dispatcher/Intents';

export const DuplicateBlockCommand: Command<BlockTargetPayload, CaretResult> = {
  type: 'duplicateBlock',

  canExecute({ engine, transaction }, { blockId }) {
    const block = transaction.getBlock(blockId);
    const parent = block?.parentId ? transaction.getBlock(block.parentId) : undefined;

    return (
      !!block &&
      !!parent?.parentId && // блоки верхнего уровня страницы не дублируем
      engine.schema.validateRelation(parent.flavour, block.flavour) &&
      isKnownSubtree(engine, transaction, block)
    );
  },

  execute({ engine, transaction }, { blockId }) {
    const block = transaction.getBlock(blockId)!;
    const parent = transaction.getBlock(block.parentId!)!;

    const copyId = clone(
      engine,
      transaction,
      block,
      parent.id,
      parent.children.indexOf(blockId) + 1,
    );

    return { blockId: copyId, offset: 0 };
  },
};

function isKnownSubtree(
  engine: CommandContext['engine'],
  tx: Transaction,
  block: BaseBlock,
): boolean {
  return (
    engine.schema.hasBlock(block.flavour) &&
    block.children.every((id) => {
      const child = tx.getBlock(id);
      return !!child && isKnownSubtree(engine, tx, child);
    })
  );
}

function clone(
  engine: CommandContext['engine'],
  tx: Transaction,
  source: BaseBlock,
  parentId: BlockId,
  index: number,
): BlockId {
  const copy = engine.block.create({
    flavour: source.flavour,
    parentId,
    props: structuredClone(source.props),
    content: structuredClone(source.content),
  });

  engine.block.insert(tx, parentId, index, copy);

  source.children.forEach((childId, i) => clone(engine, tx, tx.getBlock(childId)!, copy.id, i));

  return copy.id;
}
