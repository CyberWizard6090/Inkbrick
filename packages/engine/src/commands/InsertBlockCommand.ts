import type { BaseBlock, BlockId } from '@inkbrick/document';

import type { Command } from './Command';
import type { CaretResult, InsertBlockPayload } from '../dispatcher/Intents';

/**
 * Вставляет блок любого зарегистрированного типа сразу после `afterId`
 * (в того же родителя) или первым потомком `parentId`.
 */
export const InsertBlockCommand: Command<InsertBlockPayload, CaretResult | undefined> = {
  type: 'insertBlock',

  canExecute({ engine, transaction }, payload) {
    const parent = resolveParent(transaction.getBlock.bind(transaction), payload);

    return !!parent && engine.schema.validateRelation(parent.flavour, payload.flavour);
  },

  execute({ engine, transaction }, payload) {
    const parent = resolveParent(transaction.getBlock.bind(transaction), payload)!;

    const index = payload.afterId ? parent.children.indexOf(payload.afterId) + 1 : 0;
    const block = engine.block.create({
      flavour: payload.flavour,
      parentId: parent.id,
      props: payload.props,
      content: payload.content,
    });

    engine.block.insert(transaction, parent.id, index, block);

    return { blockId: block.id, offset: 0 };
  },
};

function resolveParent(
  getBlock: (id: BlockId) => BaseBlock | undefined,
  { afterId, parentId }: InsertBlockPayload,
) {
  if (afterId) {
    const after = getBlock(afterId);
    return after?.parentId ? getBlock(after.parentId) : undefined;
  }

  return parentId ? getBlock(parentId) : undefined;
}
