import { alignProps, isAlignable, isAlignment, type BaseBlock } from '@inkbrick/document';

import type { Command, CommandContext } from './Command';
import type { SetAlignPayload } from '../dispatcher/Intents';
import { orderRange } from '../utils';

function alignableBlocks(
  { engine, transaction }: CommandContext,
  { from, to }: SetAlignPayload,
): BaseBlock[] {
  const range = orderRange(
    transaction.getBlock.bind(transaction),
    engine.store.document.rootId,
    from,
    to,
  );

  return range ? range.blocks.filter((block) => isAlignable(block.flavour)) : [];
}

/**
 * Выравнивание текста (`left`, `center`, `right`, `justify`) у всех подходящих блоков диапазона одним шагом истории.
 * Блоки без выравнивания (код, картинка, формула) пропускаются.
 */
export const SetAlignCommand: Command<SetAlignPayload, void> = {
  type: 'setAlign',

  canExecute(context, payload) {
    return isAlignment(payload.align) && alignableBlocks(context, payload).length > 0;
  },

  execute(context, payload) {
    for (const block of alignableBlocks(context, payload)) {
      context.engine.block.update(context.transaction, block.id, (current) => ({
        ...current,
        props: { ...current.props, ...alignProps(current.flavour, payload.align) },
      }));
    }
  },
};
