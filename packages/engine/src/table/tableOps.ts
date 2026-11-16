import { TABLE, TABLE_CELL, TABLE_ROW, type BlockId, type TableProps } from '@inkbrick/document';
import type { Transaction } from '@inkbrick/store';

import type { Engine } from '../editor/Engine';

/** Списки по столбцам в props таблицы (ширины, типы) и чем дополнять короткий список. */
export const COLUMN_LISTS = [
  { key: 'widths', fill: null },
  { key: 'columnTypes', fill: 'text' },
] as const;

/**
 * Копии списков по столбцам, дополненные до числа столбцов и изменённые `change(list, fill)`.
 * `undefined`, если у таблицы нет ни одного списка. Индексы списков — столбцы, какими они были до правки.
 */
export function shiftedLists(
  props: TableProps,
  columns: number,
  change: (list: unknown[], fill: unknown) => void,
): Partial<Record<(typeof COLUMN_LISTS)[number]['key'], unknown[]>> | undefined {
  const result: Partial<Record<(typeof COLUMN_LISTS)[number]['key'], unknown[]>> = {};

  for (const { key, fill } of COLUMN_LISTS) {
    const list = props[key] as unknown[] | undefined;

    if (!list) continue;

    const next = Array.from({ length: columns }, (_, i) => list[i] ?? fill);

    change(next, fill);
    result[key] = next;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

const columnsIn = (tx: Transaction, tableId: BlockId): number =>
  tx.getBlock(tx.getBlock(tableId)?.children[0] ?? '')?.children.length ?? 0;

/** Пустая строка на месте `index`; возвращает id её ячеек. Общая часть команды `insertTableRow` и вставки из буфера. */
export function addTableRow(
  engine: Engine,
  tx: Transaction,
  tableId: BlockId,
  index: number,
): BlockId[] {
  // Ширина — до вставки: новая строка, вставленная первой, ещё пуста.
  const columns = Math.max(1, columnsIn(tx, tableId));
  const row = engine.block.create({ flavour: TABLE_ROW, parentId: tableId });

  engine.block.insert(tx, tableId, index, row);

  return engine.block.build(
    tx,
    row.id,
    Array.from({ length: columns }, () => ({ flavour: TABLE_CELL })),
  );
}

/** Пустой столбец на месте `index`; возвращает id его ячеек по строкам. Ширины столбцов сдвигаются вместе с ним. */
export function addTableColumn(
  engine: Engine,
  tx: Transaction,
  tableId: BlockId,
  index: number,
): BlockId[] {
  const table = tx.getBlock(tableId)!;
  const props = table.props as TableProps;

  const lists = shiftedLists(props, columnsIn(tx, tableId), (list, fill) =>
    list.splice(index, 0, fill),
  );

  if (lists) engine.block.morph(tx, tableId, TABLE, { ...table.props, ...lists } as TableProps);

  return table.children.map((rowId) => {
    const cell = engine.block.create({ flavour: TABLE_CELL, parentId: rowId });

    engine.block.insert(tx, rowId, index, cell);

    return cell.id;
  });
}
