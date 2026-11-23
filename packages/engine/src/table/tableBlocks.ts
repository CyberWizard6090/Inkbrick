import { TableCellSchema, TableRowSchema, TableSchema, type TableProps } from '@inkbrick/document';

import type { AnyBlockDefinition, BlockDefinition } from '../controller/BlockController';
import type { EditorFeature } from '../feature';
import { tableCommands } from './tableCommands';

/**
 * Таблица для редактора: схемы таблицы, строки и ячейки и команды строк и столбцов.
 * Во встроенный набор блоков не входит — подключается явно:
 *
 * ```ts
 * const editor = new Editor({ features: [tableFeature] }); // или { blocks: tableBlocks }
 *
 * editor.dispatch({ type: 'insertBlock', payload: { flavour: 'block:table', afterId } }); // таблица 3×3
 * editor.dispatch({ type: 'insertTableRow', payload: { blockId: tableId, index: 1 } });
 * ```
 */
export const tableBlocks: readonly AnyBlockDefinition[] = [
  { schema: TableSchema, controller: { commands: tableCommands } } as BlockDefinition<TableProps>,
  { schema: TableRowSchema },
  { schema: TableCellSchema },
];

/** Таблицы: блоки таблицы, строки и ячейки с командами строк, столбцов, объединения, сортировки и оформления. */
export const tableFeature: EditorFeature = { name: 'table', blocks: tableBlocks };
