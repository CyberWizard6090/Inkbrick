import type { BaseBlock } from '@inkbrick/document';

import type { CommandContext } from './Command';
import { isTextBlock } from '../utils';

/** Блок вложен в другой текстовый блок (например, пункт внутри пункта) и может подняться на уровень выше. */
export function canOutdent({ engine, transaction }: CommandContext, block: BaseBlock): boolean {
  const parent = block.parentId ? transaction.getBlock(block.parentId) : undefined;
  const grand = parent?.parentId ? transaction.getBlock(parent.parentId) : undefined;

  return (
    !!parent &&
    !!grand &&
    isTextBlock(engine.schema, parent) &&
    engine.schema.validateRelation(grand.flavour, block.flavour)
  );
}

/**
 * Поднимает блок на уровень выше — сразу после бывшего родителя.
 *
 * Порядок текста сохраняется: блоки, которые шли после поднятого, становятся его потомками
 * (если схема позволяет), иначе встают следом за ним. Без этого поднятый блок «перепрыгивал»
 * бы через свои следующие соседние блоки.
 */
export function outdent(context: CommandContext, blockId: string): void {
  const { engine, transaction } = context;
  const block = transaction.getBlock(blockId)!;
  const parent = transaction.getBlock(block.parentId!)!;
  const grand = transaction.getBlock(parent.parentId!)!;

  const later = parent.children.slice(parent.children.indexOf(blockId) + 1);

  engine.block.move(transaction, blockId, grand.id, grand.children.indexOf(parent.id) + 1);

  let placedAfter = 0;

  for (const siblingId of later) {
    const sibling = transaction.getBlock(siblingId)!;

    if (engine.schema.validateRelation(block.flavour, sibling.flavour)) {
      const current = transaction.getBlock(blockId)!;
      engine.block.move(transaction, siblingId, blockId, current.children.length);
    } else {
      const current = transaction.getBlock(grand.id)!;
      engine.block.move(
        transaction,
        siblingId,
        grand.id,
        current.children.indexOf(blockId) + 1 + placedAfter++,
      );
    }
  }
}
