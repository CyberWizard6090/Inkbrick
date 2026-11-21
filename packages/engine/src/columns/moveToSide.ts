import { COLUMN, COLUMNS, MAX_COLUMNS } from '@inkbrick/document';

import type { Command, CommandContext } from '../commands/Command';
import type { CaretResult, MoveBlockToSidePayload } from '../dispatcher/Intents';
import { isIsolating } from '../utils';
import { reshape } from './columnsCommands';

/** Где встанут колонки: рядом с колонкой целевого блока (`columnsId`) или на месте целевого блока в `parentId`. */
function plan(
  { engine, transaction: tx }: CommandContext,
  { blockId, targetId, side }: MoveBlockToSidePayload,
) {
  const { schema } = engine;
  const block = tx.getBlock(blockId);
  const target = tx.getBlock(targetId);
  const parent = target?.parentId ? tx.getBlock(target.parentId) : undefined;
  const columns = parent?.parentId ? tx.getBlock(parent.parentId) : undefined;

  if (!block?.parentId || !target || !parent?.parentId || blockId === targetId) return undefined;
  if ((side !== 'left' && side !== 'right') || !schema.hasBlock(COLUMNS)) return undefined;

  // В колонку идут обычные блоки: не контейнеры документа и не части составных блоков.
  for (const { flavour, ...rest } of [block, target]) {
    if (
      !schema.hasBlock(flavour) ||
      schema.getRole(flavour) !== 'content' ||
      isIsolating(schema, { flavour, ...rest }) ||
      !schema.validateRelation(COLUMN, flavour)
    ) {
      return undefined;
    }
  }

  // Нельзя переносить блок в его же поддерево.
  for (let item: typeof target | undefined = target; item; item = tx.getBlock(item.parentId!)) {
    if (item.id === blockId) return undefined;
  }

  const inColumn = parent.flavour === COLUMN && columns?.flavour === COLUMNS;

  if (
    inColumn
      ? columns.children.length >= MAX_COLUMNS
      : !schema.validateRelation(parent.flavour, COLUMNS)
  ) {
    return undefined;
  }

  return engine.block.fitsDepth(tx, parent.id, blockId)
    ? { columnsId: inColumn ? columns.id : undefined, parentId: parent.id }
    : undefined;
}

/**
 * Перетаскивание блока к левому или правому краю другого блока: они встают рядом, в колонки. Если целевой блок уже
 * в колонке, рядом с ней добавляется новая колонка (до шести); иначе на его месте появляется блок колонок из двух.
 * Колонка, из которой унесли последний блок, пропадает. Работает, только если подключены колонки (`columnsBlocks`).
 */
export const MoveBlockToSideCommand: Command<MoveBlockToSidePayload, CaretResult> = {
  type: 'moveBlockToSide',

  canExecute: (context, payload) => !!plan(context, payload),

  execute(context, payload) {
    const { engine, transaction: tx } = context;
    const { blockId, targetId, side } = payload;
    const { columnsId, parentId } = plan(context, payload)!;
    const sourceId = tx.getBlock(blockId)!.parentId!;
    const make = (flavour: string, owner: string, index: number) => {
      const created = engine.block.create({ flavour, parentId: owner });

      engine.block.insert(tx, owner, index, created);

      return created.id;
    };

    if (columnsId) {
      const index = tx.getBlock(columnsId)!.children.indexOf(parentId) + (side === 'right' ? 1 : 0);

      engine.block.move(tx, blockId, make(COLUMN, columnsId, index), 0);
      reshape(engine, tx, columnsId, (ratios) =>
        ratios.splice(index, 0, ratios.reduce((sum, value) => sum + value, 0) / ratios.length),
      );
    } else {
      const columns = make(COLUMNS, parentId, tx.getBlock(parentId)!.children.indexOf(targetId));
      const [first, second] = [make(COLUMN, columns, 0), make(COLUMN, columns, 1)];
      const left = side === 'left';

      engine.block.move(tx, left ? blockId : targetId, first, 0);
      engine.block.move(tx, left ? targetId : blockId, second, 0);
    }

    // Опустевшая колонка (из неё унесли последний блок) пропадает сама: см. `collapseEmptyColumns` в диспетчере.

    return { blockId, offset: 0 };
  },
};
