import { ColumnSchema, ColumnsSchema, type ColumnsProps } from '@inkbrick/document';

import type { BlockDefinition } from '../controller/BlockController';
import { columnsCommands } from './columnsCommands';

export * from './columnsCommands';
export { MoveBlockToSideCommand } from './moveToSide';

/**
 * Колонки для редактора: схемы `block:columns` и `block:column` и команды добавления, удаления колонок и их ширины.
 * Во встроенный набор не входят — подключаются явно:
 *
 * ```ts
 * const editor = new Editor({ blocks: columnsBlocks });
 *
 * editor.dispatch({ type: 'insertBlock', payload: { flavour: 'block:columns', afterId } }); // две колонки
 * editor.dispatch({ type: 'addColumn', payload: { blockId: columnsId, index: 2 } });
 * ```
 */
export const columnsBlocks: readonly BlockDefinition<any>[] = [
  {
    schema: ColumnsSchema,
    controller: { commands: columnsCommands },
  } as BlockDefinition<ColumnsProps>,
  { schema: ColumnSchema },
];
