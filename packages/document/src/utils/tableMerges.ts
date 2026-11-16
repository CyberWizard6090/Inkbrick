import type { TableMerge } from '../schema/blocks/TableSchema';

const overlaps = (a: TableMerge, b: TableMerge) =>
  a.row < b.row + b.rows &&
  b.row < a.row + a.rows &&
  a.column < b.column + b.columns &&
  b.column < a.column + a.columns;

const isInt = (value: unknown): value is number => Number.isInteger(value);

/**
 * Объединения таблицы `rows` × `columns`, пригодные к использованию: внутри сетки, не меньше двух ячеек, без пересечений.
 * Негодные (из чужого или повреждённого документа) пропускаются, остальные идут по порядку строк и столбцов.
 */
export function normalizeMerges(merges: unknown, rows: number, columns: number): TableMerge[] {
  if (!Array.isArray(merges)) return [];

  const valid: TableMerge[] = [];

  for (const item of merges as Partial<TableMerge>[]) {
    if (
      !item ||
      !isInt(item.row) ||
      !isInt(item.column) ||
      !isInt(item.rows) ||
      !isInt(item.columns) ||
      item.row < 0 ||
      item.column < 0 ||
      item.rows < 1 ||
      item.columns < 1 ||
      item.rows * item.columns < 2 ||
      item.row + item.rows > rows ||
      item.column + item.columns > columns
    ) {
      continue;
    }

    const merge = { row: item.row, column: item.column, rows: item.rows, columns: item.columns };

    if (!valid.some((other) => overlaps(other, merge))) valid.push(merge);
  }

  return valid.sort((a, b) => a.row - b.row || a.column - b.column);
}
