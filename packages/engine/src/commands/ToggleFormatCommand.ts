import type { Command } from './Command';
import type { ToggleFormatPayload } from '../dispatcher/Intents';

export const ToggleFormatCommand: Command<ToggleFormatPayload, void> = {
  type: 'toggleFormat',

  canExecute({ transaction }, { blockId, from, to }) {
    return transaction.getBlock(blockId) !== undefined && from !== to;
  },

  execute({ engine, transaction }, { blockId, from, to, format }) {
    const block = transaction.getBlock(blockId)!;
    const enabled = engine.inline.hasFormat(block.content, from, to, format);

    engine.block.updateContent(
      transaction,
      blockId,
      engine.inline.format(block.content, from, to, { [format]: enabled ? undefined : true }),
    );
  },
};
