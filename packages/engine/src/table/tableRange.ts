import {
  isAlignment,
  isBlockBackground,
  isColorName,
  TABLE_BORDER_WIDTHS,
  type BaseBlock,
  type BlockId,
} from '@inkbrick/document';

import type { Fragment } from '../clipboard/types';
import { tableCellAt, tableSize } from './tableGrid';
import { tableFragment } from './tableFragment';
import { mergesWithin, normalizeMerges } from './tableMerge';

type GetBlock = (id: BlockId) => BaseBlock | undefined;

const BORDER_KEYS = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const;

/** Прямоугольник ячеек: номера строк и столбцов с нуля, границы включительно. */
export interface TableRange {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export interface TableCellRef {
  readonly row: number;
  readonly column: number;
}

/** Прямоугольник между двумя ячейками (в любом порядке). */
export function tableRangeBetween(a: TableCellRef, b: TableCellRef): TableRange {
  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.column, b.column),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.column, b.column),
  };
}

/** Прямоугольник, обрезанный по размеру таблицы; `undefined`, если после обрезки он пуст. */
export function clampTableRange(
  getBlock: GetBlock,
  tableId: BlockId,
  range: TableRange,
): TableRange | undefined {
  const size = tableSize(getBlock, tableId);

  if (!size || size.rows === 0 || size.columns === 0) return undefined;

  const clamped = {
    top: Math.max(0, range.top),
    left: Math.max(0, range.left),
    bottom: Math.min(size.rows - 1, range.bottom),
    right: Math.min(size.columns - 1, range.right),
  };

  return clamped.top <= clamped.bottom && clamped.left <= clamped.right ? clamped : undefined;
}

/** Id ячеек прямоугольника по строкам. */
export function tableRangeCells(
  getBlock: GetBlock,
  tableId: BlockId,
  range: TableRange,
): BlockId[][] {
  const clamped = clampTableRange(getBlock, tableId, range);

  if (!clamped) return [];

  return Array.from({ length: clamped.bottom - clamped.top + 1 }, (_, r) =>
    Array.from({ length: clamped.right - clamped.left + 1 }, (_, c) =>
      tableCellAt(getBlock, tableId, clamped.top + r, clamped.left + c)!,
    ),
  );
}

/**
 * Фрагмент буфера обмена из прямоугольника ячеек: таблица только из них, с форматированием текста и выравниванием
 * столбцов. Первая строка остаётся заголовком, только если в прямоугольник попала первая строка таблицы.
 */
export function tableRangeFragment(
  getBlock: GetBlock,
  tableId: BlockId,
  range: TableRange,
): Fragment {
  const cells = tableRangeCells(getBlock, tableId, range);
  const table = getBlock(tableId);

  if (cells.length === 0 || !table) return { blocks: [] };

  const clamped = clampTableRange(getBlock, tableId, range)!;
  const own = cells.map((row) =>
    row.map((id) => {
      const props = getBlock(id)?.props ?? {};
      const { align, background } = props;
      const borders = Object.fromEntries(
        BORDER_KEYS.filter((key) => TABLE_BORDER_WIDTHS.includes(props[key] as never)).map(
          (key) => [key, props[key]],
        ),
      );

      return {
        ...(isAlignment(align) && align !== 'left' ? { align } : {}),
        ...(isBlockBackground(background) ? { background } : {}),
        ...borders,
        ...(isColorName(props.borderColor) ? { borderColor: props.borderColor } : {}),
      };
    }),
  );

  return tableFragment(
    cells.map((row) => row.map((id) => getBlock(id)?.content ?? [])),
    {
      header: table.props.header !== false && clamped.top === 0,
      headerColumn: table.props.headerColumn === true && clamped.left === 0,
      striped: table.props.striped === true,
      borders: table.props.borders !== false,
      cellProps: own,
      columnTypes: Array.isArray(table.props.columnTypes)
        ? table.props.columnTypes.slice(clamped.left, clamped.right + 1)
        : undefined,
      merges: mergesWithin(
        normalizeMerges(
          table.props.merges,
          tableSize(getBlock, tableId)?.rows ?? 0,
          tableSize(getBlock, tableId)?.columns ?? 0,
        ),
        clamped,
      ),
    },
  );
}
