import { normalizeMerges, type BlockId } from '@inkbrick/document';

import type { Editor } from '../editor/Editor';
import { mergeAt } from './tableMerge';
import { tableCellAt, tableSize } from './tableGrid';
import type { TableRange } from './tableRange';

/** Ячейка в углу диапазона: куда поставить каретку, когда выделение ячеек снято. */
export function cellOfRange(
  editor: Editor,
  tableId: BlockId,
  range: TableRange,
  corner: 'start' | 'end',
): BlockId | undefined {
  return tableCellAt(
    (id) => editor.store.getBlock(id),
    tableId,
    corner === 'start' ? range.top : range.bottom,
    corner === 'start' ? range.left : range.right,
  );
}

/** Ячейка, в которую можно поставить каретку: у перекрытой объединением — его верхняя левая. */
export function visibleCell(
  editor: Editor,
  tableId: BlockId,
  row: number,
  column: number,
): { row: number; column: number; id: BlockId | undefined } {
  const getBlock = (id: BlockId) => editor.store.getBlock(id);
  const size = tableSize(getBlock, tableId);
  const merges = normalizeMerges(
    getBlock(tableId)?.props.merges,
    size?.rows ?? 0,
    size?.columns ?? 0,
  );
  const found = mergeAt(merges, row, column);
  const target = found ? { row: found.merge.row, column: found.merge.column } : { row, column };

  return { ...target, id: tableCellAt(getBlock, tableId, target.row, target.column) };
}
