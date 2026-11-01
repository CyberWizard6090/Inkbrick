import type { Command } from './Command';
import type { CaretResult, ReplaceTextPayload } from '../dispatcher/Intents';

export const ReplaceTextCommand: Command<ReplaceTextPayload, CaretResult> = {
  type: 'replaceText',

  canExecute({ transaction }, { blockId }) {
    return transaction.getBlock(blockId) !== undefined;
  },

  execute({ engine, transaction }, { blockId, from, to, text }) {
    const block = transaction.getBlock(blockId)!;
    const start = Math.min(from, to);
    const end = Math.max(from, to);

    const inherited = engine.inline.attributesBefore(
      block.content,
      start === end ? start : start + 1,
    );
    const { link: _link, formula: _formula, ...attributes } = inherited ?? {};

    const withoutRange = engine.inline.deleteText(block.content, start, end);
    const next = engine.inline.insertText(
      withoutRange,
      start,
      text,
      Object.keys(attributes).length > 0 ? attributes : undefined,
    );

    engine.block.updateContent(transaction, blockId, next);

    return { blockId, offset: start + text.length };
  },
};
