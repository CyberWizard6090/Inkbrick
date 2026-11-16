import { TABLE, TABLE_CELL, TABLE_ROW, type BlockId, type TableProps } from '@inkbrick/document';
import type { Transaction } from '@inkbrick/store';

import type { Engine } from '../editor/Engine';

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

  if (props.widths) {
    // Список ширин может быть короче числа столбцов — дополняем, чтобы индексы совпали со столбцами.
    const widths = Array.from(
      { length: columnsIn(tx, tableId) },
      (_, i) => props.widths![i] ?? null,
    );

    widths.splice(index, 0, null);
    engine.block.morph(tx, tableId, TABLE, { ...table.props, widths });
  }

  return table.children.map((rowId) => {
    const cell = engine.block.create({ flavour: TABLE_CELL, parentId: rowId });

    engine.block.insert(tx, rowId, index, cell);

    return cell.id;
  });
}
