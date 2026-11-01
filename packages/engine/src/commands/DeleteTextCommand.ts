import type { Command } from './Command';
import type { CaretResult, DeleteTextPayload } from '../dispatcher/Intents';

export const DeleteTextCommand: Command<DeleteTextPayload, CaretResult> = {
  type: 'deleteText',

  canExecute({ transaction }, { blockId, from, to }) {
    return transaction.getBlock(blockId) !== undefined && from !== to;
  },

  execute({ engine, transaction }, { blockId, from, to }) {
    const block = transaction.getBlock(blockId)!;

    engine.block.updateContent(
      transaction,
      blockId,
      engine.inline.deleteText(block.content, from, to),
    );

    return { blockId, offset: Math.min(from, to) };
  },
};
