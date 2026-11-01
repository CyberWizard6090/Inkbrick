import type { Command } from './Command';
import type { CaretResult, SplitBlockPayload } from '../dispatcher/Intents';
import { canOutdent, outdent } from './outdent';

/**
 * Enter. Поведение задаётся схемой блока (`BlockSchema.enter`):
 *  - по умолчанию блок делится по offset, новый блок — сразу после текущего;
 *  - `nextFlavour` — тип нового блока (после заголовка — параграф);
 *  - `exitWhenEmpty` — Enter в пустом блоке выходит из него: вложенный поднимается на уровень выше,
 *    блок верхнего уровня становится параграфом (списки, цитаты);
 *  - `mode: 'newline'` — вставляется перевод строки; Enter на пустой последней строке выходит из блока (код).
 */
export const SplitBlockCommand: Command<SplitBlockPayload, CaretResult> = {
  type: 'splitBlock',

  canExecute({ transaction }, { blockId }) {
    return transaction.getBlock(blockId)?.parentId != null;
  },

  execute(context, { blockId, offset }) {
    const { engine, transaction } = context;
    const block = transaction.getBlock(blockId)!;
    const parent = transaction.getBlock(block.parentId!)!;
    const rule = engine.schema.getBlockSchema(block.flavour)?.enter ?? {};
    const length = engine.inline.length(block.content);
    const insertAfter = parent.children.indexOf(blockId) + 1;

    if (rule.mode === 'newline') {
      const text = engine.inline.toPlainText(block.content);

      if (offset === length && text.endsWith('\n')) {
        engine.block.updateContent(
          transaction,
          blockId,
          engine.inline.deleteText(block.content, length - 1, length),
        );

        const exit = engine.block.create({ flavour: 'block:paragraph', parentId: parent.id });
        engine.block.insert(transaction, parent.id, insertAfter, exit);

        return { blockId: exit.id, offset: 0 };
      }

      engine.block.updateContent(
        transaction,
        blockId,
        engine.inline.insertText(block.content, offset, '\n'),
      );

      return { blockId, offset: offset + 1 };
    }

    if (rule.exitWhenEmpty && length === 0) {
      // Вложенный пустой блок сначала поднимается на уровень выше; на верхнем уровне — становится параграфом.
      if (canOutdent(context, block)) outdent(context, blockId);
      else engine.block.morph(transaction, blockId, 'block:paragraph');

      return { blockId, offset: 0 };
    }

    const [left, right] = engine.inline.split(block.content, offset);

    const flavour = rule.nextFlavour ?? block.flavour;
    const props = flavour === block.flavour ? block.props : undefined;

    const created = engine.block.create({ flavour, parentId: parent.id, props, content: right });

    engine.block.updateContent(transaction, blockId, left);
    engine.block.insert(transaction, parent.id, insertAfter, created);

    return { blockId: created.id, offset: 0 };
  },
};
