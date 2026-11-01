import type { Command } from './Command';
import type { ToggleFormatRangePayload } from '../dispatcher/Intents';
import { textSegments } from '../utils';

export const ToggleFormatRangeCommand: Command<ToggleFormatRangePayload, void> = {
  type: 'toggleFormatRange',

  canExecute({ engine, transaction }, { from, to }) {
    return (
      textSegments(
        transaction.getBlock.bind(transaction),
        engine.store.document.rootId,
        engine.schema,
        from,
        to,
      ).length > 0
    );
  },

  execute({ engine, transaction }, { from, to, format }) {
    const segments = textSegments(
      transaction.getBlock.bind(transaction),
      engine.store.document.rootId,
      engine.schema,
      from,
      to,
    );

    const enabled = segments.every((s) =>
      engine.inline.hasFormat(s.block.content, s.start, s.end, format),
    );

    for (const { block, start, end } of segments) {
      engine.block.updateContent(
        transaction,
        block.id,
        engine.inline.format(block.content, start, end, { [format]: enabled ? undefined : true }),
      );
    }
  },
};
