import { BLOCK_BACKGROUNDS, type BlockId, type BlockProps } from '@inkbrick/document';

import type { Command, CommandContext } from './Command';
import { ConvertBlockCommand } from './ConvertBlockCommand';
import { DuplicateBlockCommand } from './DuplicateBlockCommand';
import { MoveBlockCommand } from './MoveBlockCommand';
import { SetBlockPropsCommand } from './SetBlockPropsCommand';

/*
 * Команды над группой блоков — например, над выбранными целиком (рамкой, Shift+стрелками, Ctrl+A). Каждая — одна правка
 * и один шаг отмены; блоки, к которым действие не применимо, пропускаются, а команда отклоняется, только если не подошёл
 * ни один. Порядок `ids` — порядок документа.
 */

export interface BlockGroupPayload {
  readonly ids: readonly BlockId[];
}

export interface MoveBlocksPayload extends BlockGroupPayload {
  /** `-1` — на одну позицию вверх (перед предыдущим соседом), `1` — вниз. */
  readonly direction: 1 | -1;
}

export interface ConvertBlocksPayload extends BlockGroupPayload {
  readonly flavour: string;
  readonly props?: BlockProps;
}

export interface SetBlockBackgroundsPayload extends BlockGroupPayload {
  /** Имя фона из палитры или свой CSS-цвет; `null` снимает фон. */
  readonly background: string | null;
}

/** Блоки, которые команда изменила (копии — для `duplicateBlocks`). */
export interface BlockGroupResult {
  readonly ids: readonly BlockId[];
}

const isList = (ids: unknown): ids is readonly BlockId[] =>
  Array.isArray(ids) && ids.every((id) => typeof id === 'string');

/** Блоки группы, которые движок знает (схема зарегистрирована): неизвестные данные команды не трогают. */
function known({ engine, transaction }: CommandContext, ids: readonly BlockId[]): BlockId[] {
  return ids.filter((id) => {
    const block = transaction.getBlock(id);

    return !!block && engine.schema.hasBlock(block.flavour);
  });
}

/** Дублирует блоки: копии идут подряд сразу после последнего из группы, в том же порядке. */
export const DuplicateBlocksCommand: Command<BlockGroupPayload, BlockGroupResult> = {
  type: 'duplicateBlocks',

  canExecute(context, { ids }) {
    return (
      isList(ids) &&
      known(context, ids).some((blockId) => DuplicateBlockCommand.canExecute(context, { blockId }))
    );
  },

  execute(context, { ids }) {
    const copies: BlockId[] = [];

    for (const blockId of known(context, ids)) {
      if (DuplicateBlockCommand.canExecute(context, { blockId }))
        copies.push(DuplicateBlockCommand.execute(context, { blockId }).blockId);
    }

    // Копия встаёт сразу после своего оригинала; собираем их рядом после последнего оригинала.
    let after = ids.at(-1)!;

    for (const blockId of copies) {
      const move = { blockId, targetId: after, position: 'after' as const };

      if (MoveBlockCommand.canExecute(context, move)) {
        MoveBlockCommand.execute(context, move);
        after = blockId;
      }
    }

    return { ids: copies };
  },
};

/**
 * Переносы для сдвига группы на одну позицию среди соседей первого блока. Выбор вразброс сдвигается блок за блоком,
 * порядок выбранных сохраняется: вверх идём по порядку, вниз — с конца, и блок не обгоняет того, что уже у края.
 */
function movePlan({ transaction }: CommandContext, ids: readonly BlockId[], direction: 1 | -1) {
  const first = ids[0] ? transaction.getBlock(ids[0]) : undefined;
  const parent = first?.parentId ? transaction.getBlock(first.parentId) : undefined;

  if (!parent) return [];

  const chosen = new Set(ids);
  const position = direction === -1 ? ('before' as const) : ('after' as const);
  const order = direction === -1 ? [...ids] : [...ids].reverse();
  const level = [...parent.children];
  const moves: { blockId: BlockId; targetId: BlockId; position: 'before' | 'after' }[] = [];

  for (const blockId of order) {
    const at = level.indexOf(blockId);
    const targetId = level[at + direction];

    if (at < 0 || !targetId || chosen.has(targetId)) continue;

    moves.push({ blockId, targetId, position });
    level.splice(at, 1);
    level.splice(level.indexOf(targetId) + (direction === -1 ? 0 : 1), 0, blockId);
  }

  return moves;
}

/** Сдвигает группу на одну позицию вверх или вниз; отклоняется, если дальше некуда или перенос недопустим. */
export const MoveBlocksCommand: Command<MoveBlocksPayload, void> = {
  type: 'moveBlocks',

  canExecute(context, { ids, direction }) {
    if (!isList(ids) || (direction !== 1 && direction !== -1)) return false;
    if (known(context, ids).length !== ids.length) return false;

    const moves = movePlan(context, ids, direction);

    return moves.length > 0 && moves.every((move) => MoveBlockCommand.canExecute(context, move));
  },

  execute(context, { ids, direction }) {
    for (const move of movePlan(context, ids, direction)) MoveBlockCommand.execute(context, move);
  },
};

/**
 * Блоки группы, которые превращаются в `flavour`. В тип без текста (разделитель, таблица) превращается только один блок:
 * такой тип вставляется рядом и сдвигает остальные, ряд развалился бы.
 */
export function convertibleBlocks(
  context: CommandContext,
  { ids, flavour, props }: ConvertBlocksPayload,
): BlockId[] {
  if (!isList(ids) || !convertsAsGroup(context.engine.schema, flavour, ids.length)) return [];

  return known(context, ids).filter((blockId) =>
    ConvertBlockCommand.canExecute(context, { blockId, flavour, props }),
  );
}

/** Можно ли превратить в `flavour` столько блоков сразу: в тип без текста — только один. */
export function convertsAsGroup(
  schema: CommandContext['engine']['schema'],
  flavour: string,
  count: number,
): boolean {
  return count <= 1 || schema.getBlockSchema(flavour)?.inline !== false;
}

/** Превращает блоки группы в другой тип; те, что не превращаются, остаются как были. */
export const ConvertBlocksCommand: Command<ConvertBlocksPayload, BlockGroupResult> = {
  type: 'convertBlocks',

  canExecute(context, payload) {
    return convertibleBlocks(context, payload).length > 0;
  },

  execute(context, payload) {
    const targets = convertibleBlocks(context, payload);

    for (const blockId of targets) {
      ConvertBlockCommand.execute(context, {
        blockId,
        flavour: payload.flavour,
        props: payload.props,
      });
    }

    return { ids: targets };
  },
};

/** Блоки группы, у которых бывает фон (схема принимает `background`). */
export function backgroundBlocks(context: CommandContext, ids: readonly BlockId[]): BlockId[] {
  if (!isList(ids)) return [];

  return known(context, ids).filter((blockId) =>
    SetBlockPropsCommand.canExecute(context, {
      blockId,
      props: { background: BLOCK_BACKGROUNDS[0] },
    }),
  );
}

/** Задаёт фон блокам группы (или снимает, `null`); блоки без фона пропускаются. */
export const SetBlockBackgroundsCommand: Command<SetBlockBackgroundsPayload, BlockGroupResult> = {
  type: 'setBlockBackgrounds',

  canExecute(context, { ids, background }) {
    return (
      (background === null || typeof background === 'string') &&
      backgroundBlocks(context, ids).length > 0
    );
  },

  execute(context, { ids, background }) {
    const targets = backgroundBlocks(context, ids);

    for (const blockId of targets) {
      SetBlockPropsCommand.execute(context, {
        blockId,
        props: { background: background ?? undefined },
      });
    }

    return { ids: targets };
  },
};
