import type { BlockTargetPayload, CaretResult } from '../dispatcher/Intents';
import type { Command, CommandContext } from './Command';
import { DeleteBackwardCommand } from './DeleteBackwardCommand';

/** Следующий сосед, с которым склеивается блок; `undefined` — его нет или у него нет текста. */
function nextTextSibling({ engine, transaction }: CommandContext, blockId: string) {
  const block = transaction.getBlock(blockId);
  const parent = block?.parentId ? transaction.getBlock(block.parentId) : undefined;
  const next = parent?.children[parent.children.indexOf(blockId) + 1];
  const sibling = next ? transaction.getBlock(next) : undefined;

  return sibling && engine.schema.getBlockSchema(sibling.flavour)?.inline !== false
    ? sibling
    : undefined;
}

/**
 * Delete в конце блока: склеивает следующего соседа с этим блоком (как Backspace в начале соседа). Перед блоком без текста
 * (картинка, разделитель) не выполняется — так его не удалить случайно.
 */
export const DeleteForwardCommand: Command<BlockTargetPayload, CaretResult | undefined> = {
  type: 'deleteForward',

  canExecute(context, { blockId }) {
    const next = nextTextSibling(context, blockId);

    return !!next && DeleteBackwardCommand.canExecute(context, { blockId: next.id, offset: 0 });
  },

  execute(context, { blockId }) {
    const next = nextTextSibling(context, blockId)!;

    return DeleteBackwardCommand.execute(context, { blockId: next.id, offset: 0 });
  },
};
