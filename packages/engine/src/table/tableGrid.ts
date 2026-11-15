import { TABLE, TABLE_CELL, TABLE_ROW, type BaseBlock, type BlockId } from '@inkbrick/document';

type GetBlock = (id: BlockId) => BaseBlock | undefined;

export interface TableSize {
  readonly rows: number;
  readonly columns: number;
}

export interface TableCellPosition {
  readonly tableId: BlockId;
  readonly row: number;
  readonly column: number;
}

/** Размер таблицы; `undefined`, если блок — не таблица. */
export function tableSize(getBlock: GetBlock, tableId: BlockId): TableSize | undefined {
  const table = getBlock(tableId);

  if (table?.flavour !== TABLE) return undefined;

  return {
    rows: table.children.length,
    columns: getBlock(table.children[0] ?? '')?.children.length ?? 0,
  };
}

/** Id ячейки по номеру строки и столбца (с нуля). */
export function tableCellAt(
  getBlock: GetBlock,
  tableId: BlockId,
  row: number,
  column: number,
): BlockId | undefined {
  const table = getBlock(tableId);

  if (table?.flavour !== TABLE) return undefined;

  return getBlock(table.children[row] ?? '')?.children[column];
}

/** В какой таблице, строке и столбце стоит ячейка. */
export function locateTableCell(
  getBlock: GetBlock,
  cellId: BlockId,
): TableCellPosition | undefined {
  const cell = getBlock(cellId);
  const row = cell?.flavour === TABLE_CELL && cell.parentId ? getBlock(cell.parentId) : undefined;
  const table = row?.flavour === TABLE_ROW && row.parentId ? getBlock(row.parentId) : undefined;

  if (!row || table?.flavour !== TABLE) return undefined;

  return {
    tableId: table.id,
    row: table.children.indexOf(row.id),
    column: row.children.indexOf(cellId),
  };
}
