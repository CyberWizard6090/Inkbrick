import type { BlockId } from '@inkbrick/document';

import type { Command } from './Command';

export const ToggleHeadingCommand: Command<{ id: BlockId; level?: 1 | 2 | 3 | 4 | 5 | 6 }, void> = {
  type: 'toggle-heading',

  canExecute({ engine, transaction }, { id }) {
    const block = transaction.getBlock(id);
    if (!block?.parentId) return false;

    const parent = transaction.getBlock(block.parentId);
    if (!parent) return false;

    const target = block.flavour === 'block:heading' ? 'block:paragraph' : 'block:heading';

    return engine.schema.validateRelation(parent.flavour, target);
  },

  execute({ engine, transaction }, { id, level = 1 }) {
    const block = transaction.getBlock(id)!;

    if (block.flavour === 'block:heading') {
      engine.block.morph(transaction, id, 'block:paragraph');
    } else {
      engine.block.morph(transaction, id, 'block:heading', { level });
    }
  },
};
