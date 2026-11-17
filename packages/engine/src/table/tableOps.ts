import {
  TABLE,
  TABLE_CELL,
  TABLE_ROW,
  type BlockId,
  type TableProps,
  type TableView,
} from '@inkbrick/document';
import type { Transaction } from '@inkbrick/store';

import type { Engine } from '../editor/Engine';
import { mergesAfterInsert, normalizeMerges } from './tableMerge';

/** Списки по столбцам в props таблицы (ширины, типы) и чем дополнять короткий список. */
export const COLUMN_LISTS = [
  { key: 'widths', fill: null },
  { key: 'columnTypes', fill: 'text' },
  { key: 'columnOptions', fill: null },
] as const;

/**
 * Копии списков по столбцам, дополненные до числа столбцов и изменённые `change(list, fill)`.
 * `undefined`, если у таблицы нет ни одного списка. Индексы списков — столбцы, какими они были до правки.
 */
export function shiftedLists(
  props: TableProps,
  columns: number,
  change: (list: unknown[], fill: unknown) => void,
):
  | (Partial<Record<(typeof COLUMN_LISTS)[number]['key'], unknown[]>> & { views?: TableView[] })
  | undefined {
  const result: Partial<Record<(typeof COLUMN_LISTS)[number]['key'], unknown[]>> & {
    views?: TableView[];
  } = {};

  for (const { key, fill } of COLUMN_LISTS) {
    const list = props[key] as unknown[] | undefined;

    if (!list) continue;

    const next = Array.from({ length: columns }, (_, i) => list[i] ?? fill);

    change(next, fill);
    result[key] = next;
  }

  // Виды: скрытые столбцы и фильтры — те же списки по столбцам, а столбец сортировки переезжает вместе со своим.
  if (props.views) {
    const moved = Array.from({ length: columns }, (_, i) => i);

    change(moved, -1);

    result.views = props.views.map((view): TableView => {
      const next: TableView = { id: view.id };
      const shift = <T>(list: readonly T[] | undefined, fill: T) => {
        if (!list) return undefined;

        const copy = Array.from({ length: columns }, (_, i) => list[i] ?? fill);

        change(copy, fill);

        return copy;
      };
      const hidden = shift(view.hidden, false);
      const filters = shift(view.filters, null);
      const column = view.sort ? moved.indexOf(view.sort.column) : -1;

      if (view.name !== undefined) next.name = view.name;
      if (hidden) next.hidden = hidden;
      if (filters) next.filters = filters;
      if (view.sort && column >= 0) next.sort = { ...view.sort, column };

      return next;
    });
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
  const table = tx.getBlock(tableId)!;
  const merges = normalizeMerges(
    (table.props as TableProps).merges,
    table.children.length,
    columns,
  );

  if (merges.length > 0) {
    engine.block.morph(tx, tableId, TABLE, {
      ...table.props,
      merges: mergesAfterInsert(merges, 'row', index),
    });
  }

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

  const columns = columnsIn(tx, tableId);
  const merges = normalizeMerges(props.merges, table.children.length, columns);

  if (lists || merges.length > 0) {
    engine.block.morph(tx, tableId, TABLE, {
      ...table.props,
      ...lists,
      ...(merges.length > 0 ? { merges: mergesAfterInsert(merges, 'column', index) } : {}),
    } as TableProps);
  }

  return table.children.map((rowId) => {
    const cell = engine.block.create({ flavour: TABLE_CELL, parentId: rowId });

    engine.block.insert(tx, rowId, index, cell);

    return cell.id;
  });
}
