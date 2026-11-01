import type { Command, CommandContext } from './Command';
import type { CaretResult, MoveBlockPayload } from '../dispatcher/Intents';

/**
 * Переносит блок на место рядом с `targetId` (перед ним или после него; «после» — после всего поддерева цели).
 * Блок уезжает вместе с потомками. Нельзя переносить в собственное поддерево, рядом с блоками
 * верхнего уровня страницы или туда, где схема не допускает такой тип.
 */
export const MoveBlockCommand: Command<MoveBlockPayload, CaretResult> = {
  type: 'moveBlock',

  canExecute(context, payload) {
    return plan(context, payload) !== undefined;
  },

  execute(context, payload) {
    const { engine, transaction } = context;
    const { parentId, index } = plan(context, payload)!;

    engine.block.move(transaction, payload.blockId, parentId, index);

    return { blockId: payload.blockId, offset: 0 };
  },
};

function plan(
  { engine, transaction }: CommandContext,
  { blockId, targetId, position }: MoveBlockPayload,
) {
  if (blockId === targetId) return undefined;

  const block = transaction.getBlock(blockId);
  const target = transaction.getBlock(targetId);

  if (!block?.parentId || !target?.parentId) return undefined;

  const parent = transaction.getBlock(target.parentId);
  const blockParent = transaction.getBlock(block.parentId);

  // Блоки верхнего уровня страницы (заметки) — структура документа, их не переносим.
  if (!parent || !blockParent?.parentId || !parent.parentId) return undefined;
  if (
    !engine.schema.hasBlock(block.flavour) ||
    !engine.schema.validateRelation(parent.flavour, block.flavour)
  ) {
    return undefined;
  }

  for (let current = target; ;) {
    if (current.id === blockId) return undefined;
    if (!current.parentId) break;

    current = transaction.getBlock(current.parentId)!;
  }

  if (!engine.block.fitsDepth(transaction, parent.id, blockId)) return undefined;

  const siblings = parent.children.filter((id) => id !== blockId);
  const at = siblings.indexOf(targetId);

  return { parentId: parent.id, index: position === 'before' ? at : at + 1 };
}
