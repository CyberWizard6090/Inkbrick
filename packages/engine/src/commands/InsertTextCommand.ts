import type { Command } from './Command';
import type { CaretResult, InsertTextPayload } from '../dispatcher/Intents';

export const InsertTextCommand: Command<InsertTextPayload, CaretResult> = {
  type: 'insertText',

  canExecute({ transaction }, { selection }) {
    return transaction.getBlock(selection.anchor.blockId) !== undefined;
  },

  execute({ engine, transaction }, { text, selection }) {
    const { blockId, offset } = selection.anchor;
    const block = transaction.getBlock(blockId)!;

    // Новый текст наследует форматирование символа слева (кроме ссылки).
    const inherited = engine.inline.attributesBefore(block.content, offset);
    const { link: _link, formula: _formula, ...attributes } = inherited ?? {};

    engine.block.updateContent(
      transaction,
      blockId,
      engine.inline.insertText(
        block.content,
        offset,
        text,
        Object.keys(attributes).length > 0 ? attributes : undefined,
      ),
    );

    return { blockId, offset: offset + text.length };
  },
};
