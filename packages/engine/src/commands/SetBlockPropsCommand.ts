import type { Command } from './Command';
import type { SetBlockPropsPayload } from '../dispatcher/Intents';

export const SetBlockPropsCommand: Command<SetBlockPropsPayload, void> = {
  type: 'setBlockProps',

  canExecute({ engine, transaction }, { blockId, props }) {
    const block = transaction.getBlock(blockId);

    if (!block || !engine.schema.hasBlock(block.flavour)) return false;

    // Недопустимые props (например, небезопасный адрес картинки) отклоняются, а не бросают исключение.
    const result = engine.schema.validateProps(block.flavour, { ...block.props, ...props });

    if (!result.success) return false;

    // Без реальных изменений действия нет: в историю пустая запись не попадает.
    const next = result.data as Record<string, unknown>;
    const keys = new Set([...Object.keys(block.props), ...Object.keys(next)]);

    return [...keys].some((key) => JSON.stringify(block.props[key]) !== JSON.stringify(next[key]));
  },

  execute({ engine, transaction }, { blockId, props }) {
    const block = transaction.getBlock(blockId)!;

    // `undefined` убирает свойство (например, фон блока), а не оставляет ключ с пустым значением.
    const next = { ...block.props, ...props };

    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];

    engine.block.morph(transaction, blockId, block.flavour, next);
  },
};
