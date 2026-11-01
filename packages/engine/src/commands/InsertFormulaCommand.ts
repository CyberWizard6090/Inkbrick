import { FORMULA_CHAR, MAX_FORMULA_LENGTH } from '@inkbrick/document';

import type { Command } from './Command';
import type { CaretResult, InsertFormulaPayload } from '../dispatcher/Intents';

/**
 * Вставляет встроенную формулу: диапазон [from, to] заменяется одним символом-объектом с атрибутом `formula`.
 * Не работает в блоках без текста и в блоках кода.
 */
export const InsertFormulaCommand: Command<InsertFormulaPayload, CaretResult> = {
  type: 'insertFormula',

  canExecute({ engine, transaction }, { blockId, latex }) {
    const block = transaction.getBlock(blockId);

    return (
      block !== undefined &&
      block.flavour !== 'block:code' &&
      engine.schema.getBlockSchema(block.flavour)?.inline !== false &&
      typeof latex === 'string' &&
      latex.trim() !== '' &&
      latex.length <= MAX_FORMULA_LENGTH
    );
  },

  execute({ engine, transaction }, { blockId, from, to, latex }) {
    const block = transaction.getBlock(blockId)!;
    const start = Math.min(from, to);
    const end = Math.max(from, to);

    const without = engine.inline.deleteText(block.content, start, end);

    engine.block.updateContent(
      transaction,
      blockId,
      engine.inline.insertText(without, start, FORMULA_CHAR, { formula: latex.trim() }),
    );

    return { blockId, offset: start + 1 };
  },
};
