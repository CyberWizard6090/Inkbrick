import type { BlockId } from '@inkbrick/document';

import type { Command } from './Command';

export const InsertParagraphCommand: Command<{ targetId: BlockId }, BlockId> = {
  type: 'insert-paragraph',

  canExecute({ engine, transaction }, { targetId }) {
    const target = transaction.getBlock(targetId);
    if (!target?.parentId) return false;

    const parent = transaction.getBlock(target.parentId);

    return !!parent && engine.schema.validateRelation(parent.flavour, 'block:paragraph');
  },

  execute({ engine, transaction }, { targetId }) {
    const target = transaction.getBlock(targetId)!;
    const parent = transaction.getBlock(target.parentId!)!;

    const created = engine.block.create({ flavour: 'block:paragraph', parentId: parent.id });

    engine.block.insert(transaction, parent.id, parent.children.indexOf(targetId) + 1, created);

    return created.id;
  },
};
