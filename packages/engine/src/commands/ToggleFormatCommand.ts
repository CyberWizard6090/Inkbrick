import type { Command } from './Command';
import type { ToggleFormatPayload } from '../dispatcher/Intents';

export const ToggleFormatCommand: Command<ToggleFormatPayload, void> = {
  type: 'toggleFormat',

  canExecute({ engine, transaction }, { blockId, from, to }) {
    const block = transaction.getBlock(blockId);

    // Текст без оформления (код): Ctrl+B и другие форматы к нему не применяются.
    return (
      block !== undefined && from !== to && !engine.schema.getBlockSchema(block.flavour)?.plainText
    );
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
