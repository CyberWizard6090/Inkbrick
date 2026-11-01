import type { Command } from './Command';
import type { CaretResult, MorphBlockPayload } from '../dispatcher/Intents';

export const MorphBlockCommand: Command<MorphBlockPayload, CaretResult> = {
  type: 'morphBlock',

  canExecute({ engine, transaction }, { blockId, flavour }) {
    const block = transaction.getBlock(blockId);
    if (!block?.parentId) return false;

    const parent = transaction.getBlock(block.parentId);

    return !!parent && engine.schema.validateRelation(parent.flavour, flavour);
  },

  execute({ engine, transaction }, { blockId, flavour, props, clearFromOffset }) {
    const block = transaction.getBlock(blockId)!;

    engine.block.morph(transaction, blockId, flavour, props);

    if (clearFromOffset && clearFromOffset > 0) {
      engine.block.updateContent(
        transaction,
        blockId,
        engine.inline.deleteText(block.content, 0, clearFromOffset),
      );
    }

    return { blockId, offset: 0 };
  },
};
