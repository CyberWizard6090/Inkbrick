import {
  TableCellSchema,
  TableRowSchema,
  TableSchema,
  normalizeMerges,
  type TableProps,
} from '@inkbrick/document';

import type { AnyBlockDefinition, BlockDefinition } from '../controller/BlockController';
import type { EditorFeature } from '../feature';
import type { NormalizeRule } from '../normalizer';
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
/**
 * Правило нормализации таблиц: объединения ячеек не выходят за таблицу и не пересекаются (после правки строк и
 * столбцов и в документе из внешнего источника). Табличные команды поддерживают это сами — правило страхует остальные пути.
 */
export const normalizeTableMerges: NormalizeRule = {
  name: 'normalizeTableMerges',
  flavours: ['block:table'],
  normalize({ engine, transaction, block }) {
    const merges = block.props.merges;

    if (merges === undefined) return;

    const rows = block.children.length;
    const columns = rows > 0 ? (transaction.getBlock(block.children[0])?.children.length ?? 0) : 0;
    const valid = normalizeMerges(merges, rows, columns);

    if (JSON.stringify(valid) === JSON.stringify(merges)) return;

    engine.block.update(transaction, block.id, (table) => ({
      ...table,
      props: { ...table.props, merges: valid.length > 0 ? valid : undefined },
    }));
  },
};

export const tableFeature: EditorFeature = {
  name: 'table',
  blocks: tableBlocks,
  normalizers: [normalizeTableMerges],
};
