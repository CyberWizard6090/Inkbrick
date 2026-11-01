import type { BaseBlock } from '@inkbrick/document';
import type { Transaction } from '@inkbrick/store';

import type { Command, CommandContext } from './Command';
import type { CaretResult, ConvertBlockPayload } from '../dispatcher/Intents';
import { isTextBlock } from '../utils';

/**
 * Превращает блок в блок другого типа (slash-меню, markdown-шорткаты).
 *
 *  - Текстовый тип: блок меняется на месте, текст сохраняется.
 *  - Тип без текста (разделитель): пустой блок заменяется им, непустой остаётся,
 *    разделитель вставляется после него. В обоих случаях следом создаётся
 *    пустой параграф, куда встаёт курсор.
 *  - Потомки, которые не подходят новому типу, поднимаются на уровень блока.
 */
export const ConvertBlockCommand: Command<ConvertBlockPayload, CaretResult> = {
  type: 'convertBlock',

  canExecute(context, payload) {
    return check(context, payload) !== undefined;
  },

  execute(context, payload) {
    const { engine, transaction } = context;
    const { block, parent } = check(context, payload)!;
    const target = engine.schema.requireBlockSchema(payload.flavour);

    if (target.inline !== false) {
      liftChildren(context, block, parent, payload.flavour);
      engine.block.morph(transaction, block.id, payload.flavour, payload.props);

      const length = engine.inline.length(transaction.getBlock(block.id)!.content);

      return { blockId: block.id, offset: Math.min(payload.offset ?? length, length) };
    }

    const index = parent.children.indexOf(block.id);
    let afterId = block.id;

    if (engine.inline.length(block.content) === 0 && block.children.length === 0) {
      engine.block.morph(transaction, block.id, payload.flavour, payload.props);
    } else {
      const created = engine.block.create({
        flavour: payload.flavour,
        parentId: parent.id,
        props: payload.props,
      });
      engine.block.insert(transaction, parent.id, index + 1, created);
      afterId = created.id;
    }

    const next = engine.block.create({ flavour: 'block:paragraph', parentId: parent.id });
    engine.block.insert(
      transaction,
      parent.id,
      transaction.getBlock(parent.id)!.children.indexOf(afterId) + 1,
      next,
    );

    return { blockId: next.id, offset: 0 };
  },
};

function check({ engine, transaction }: CommandContext, { blockId, flavour }: ConvertBlockPayload) {
  const block = transaction.getBlock(blockId);

  if (!block?.parentId || !engine.schema.hasBlock(flavour)) return undefined;
  if (!isTextBlock(engine.schema, block)) return undefined;

  const parent = transaction.getBlock(block.parentId);

  if (!parent || !engine.schema.validateRelation(parent.flavour, flavour)) return undefined;

  const target = engine.schema.requireBlockSchema(flavour);

  /*
   * Нетекстовому типу некуда деть текст и потомков — нужны пустой блок без потомков или вставка рядом;
   * вставка рядом всегда возможна, поэтому ограничений нет. Для текстовых типов проверяем потомков.
   */
  if (target.inline !== false) {
    for (const childId of block.children) {
      const child = transaction.getBlock(childId);

      if (!child) return undefined;

      const fitsBlock = engine.schema.validateRelation(flavour, child.flavour);
      const fitsParent = engine.schema.validateRelation(parent.flavour, child.flavour);

      if (!fitsBlock && !fitsParent) return undefined;
    }
  }

  return { block, parent };
}

function liftChildren(
  { engine, transaction }: CommandContext,
  block: BaseBlock,
  parent: BaseBlock,
  flavour: string,
): void {
  let placed = 0;

  for (const childId of [...block.children]) {
    const child = (transaction as Transaction).getBlock(childId)!;

    if (engine.schema.validateRelation(flavour, child.flavour)) continue;

    const current = transaction.getBlock(parent.id)!;
    engine.block.move(
      transaction,
      childId,
      parent.id,
      current.children.indexOf(block.id) + 1 + placed++,
    );
  }
}
