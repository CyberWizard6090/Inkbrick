import type { BaseBlock, BlockId } from '@inkbrick/document';
import type { Transaction } from '@inkbrick/store';

import type { Command, CommandContext } from './Command';
import type { CaretResult, DeleteBackwardPayload } from '../dispatcher/Intents';
import { isIsolating, isTextBlock } from '../utils';
import { canOutdent, outdent } from './outdent';

/**
 * Backspace:
 *  - offset > 0 — удаляет символ слева (суррогатная пара удаляется целиком);
 *  - offset = 0 — ступенчато: вложенный блок поднимается на уровень выше; блок не-параграф
 *    становится параграфом; параграф склеивается с предыдущим соседним блоком
 *    (если перед ним разделитель — удаляется разделитель);
 *  - пустой первый параграф без потомков удаляется, если следом есть текстовый блок
 *    (курсор встаёт в его начало); единственный блок остаётся на месте.
 */
export const DeleteBackwardCommand: Command<DeleteBackwardPayload, CaretResult | undefined> = {
  type: 'deleteBackward',

  canExecute({ transaction }, { blockId }) {
    return transaction.getBlock(blockId) !== undefined;
  },

  execute(context, { blockId, offset }) {
    const { engine, transaction } = context;
    const block = transaction.getBlock(blockId)!;

    if (!engine.schema.hasBlock(block.flavour) || !isTextBlock(engine.schema, block))
      return undefined;

    if (offset > 0) {
      const text = engine.inline.toPlainText(block.content);
      const from = offset - (endsWithSurrogatePair(text, offset) ? 2 : 1);

      engine.block.updateContent(
        transaction,
        blockId,
        engine.inline.deleteText(block.content, from, offset),
      );

      return { blockId, offset: from };
    }

    // Ячейку таблицы нельзя ни превратить в параграф, ни склеить с соседней.
    if (isIsolating(engine.schema, block)) return undefined;

    if (canOutdent(context, block)) {
      outdent(context, blockId);
      return { blockId, offset: 0 };
    }

    if (block.flavour !== 'block:paragraph') {
      engine.block.morph(transaction, blockId, 'block:paragraph');
      return { blockId, offset: 0 };
    }

    const previous = getPreviousSibling(transaction, block);

    if (!previous) return removeEmptyFirst(context, block);

    if (!engine.schema.hasBlock(previous.flavour)) return undefined;

    // Перед блоком стоит блок без текста (разделитель): Backspace удаляет его, а не склеивает.
    if (!isTextBlock(engine.schema, previous)) {
      if (previous.children.length > 0) return undefined;

      engine.block.remove(transaction, previous.id);

      return { blockId, offset: 0 };
    }

    const caretOffset = engine.inline.length(previous.content);

    engine.block.updateContent(
      transaction,
      previous.id,
      engine.inline.merge(previous.content, block.content),
    );

    for (const childId of block.children) {
      const target = transaction.getBlock(previous.id)!;
      engine.block.move(transaction, childId, previous.id, target.children.length);
    }

    engine.block.remove(transaction, blockId);

    return { blockId: previous.id, offset: caretOffset };
  },
};

function removeEmptyFirst(
  { engine, transaction }: CommandContext,
  block: BaseBlock,
): CaretResult | undefined {
  if (engine.inline.length(block.content) > 0 || block.children.length > 0) return undefined;

  const parent = block.parentId ? transaction.getBlock(block.parentId) : undefined;
  const nextId = parent?.children[parent.children.indexOf(block.id as BlockId) + 1];
  const next = nextId ? transaction.getBlock(nextId) : undefined;

  if (!next || !engine.schema.hasBlock(next.flavour) || !isTextBlock(engine.schema, next)) {
    return undefined;
  }

  engine.block.remove(transaction, block.id);

  return { blockId: next.id, offset: 0 };
}

function endsWithSurrogatePair(text: string, offset: number): boolean {
  if (offset < 2) return false;

  const low = text.charCodeAt(offset - 1);
  const high = text.charCodeAt(offset - 2);

  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff;
}

function getPreviousSibling(transaction: Transaction, block: BaseBlock): BaseBlock | undefined {
  if (!block.parentId) return undefined;

  const parent = transaction.getBlock(block.parentId);
  if (!parent) return undefined;

  const index = parent.children.indexOf(block.id as BlockId);

  return index > 0 ? transaction.getBlock(parent.children[index - 1]) : undefined;
}
