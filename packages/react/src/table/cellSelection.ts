import { normalizeMerges, type BlockId } from '@inkbrick/document';
import {
  tableSize,
  type Editor,
  type TableCellRef,
  tableRangeBetween,
  tableRangeCells,
  type TableRange,
} from '@inkbrick/engine';
import { clampTableRange, expandRangeToMerges } from '@inkbrick/engine/internal';

import type { CellSelection } from '../editing/CellSelectionController';
import type { EditorView } from '../editing/EditorView';

/** Выделяет прямоугольник между двумя ячейками; пустой после обрезки — снимает выделение. */
export function selectTableCells(
  editor: Editor,
  view: EditorView,
  tableId: BlockId,
  anchor: TableCellRef,
  head: TableCellRef,
): CellSelection | null {
  const getBlock = (id: BlockId) => editor.store.getBlock(id);
  const size = tableSize(getBlock, tableId);
  const clamped = clampTableRange(getBlock, tableId, tableRangeBetween(anchor, head));

  if (!clamped || !size) {
    view.cells.clear();
    return null;
  }

  const range = expandRangeToMerges(
    clamped,
    normalizeMerges(getBlock(tableId)?.props.merges, size.rows, size.columns),
  );

  const next: CellSelection = {
    tableId,
    anchor,
    head,
    range,
    ids: new Set(tableRangeCells(getBlock, tableId, range).flat()),
  };

  view.cells.set(next);

  return next;
}

/** Выделяет строку или столбец целиком. */
export function selectTableLine(
  editor: Editor,
  view: EditorView,
  tableId: BlockId,
  line: { row: number } | { column: number },
): void {
  const size = tableSize((id) => editor.store.getBlock(id), tableId);

  if (!size) return;

  if ('row' in line) {
    selectTableCells(
      editor,
      view,
      tableId,
      { row: line.row, column: 0 },
      { row: line.row, column: size.columns - 1 },
    );
  } else {
    selectTableCells(
      editor,
      view,
      tableId,
      { row: 0, column: line.column },
      { row: size.rows - 1, column: line.column },
    );
  }

  view.getRoot()?.focus({ preventScroll: true });
}

/** Очищает текст выделенных ячеек одним шагом undo (команда таблицы `clearTableCellsText`); ячейки остаются. */
export function clearTableCells(
  editor: Editor,
  selection: { readonly tableId: BlockId; readonly range: TableRange },
): void {
  editor.sealHistory();
  editor.execute('clearTableCellsText', { blockId: selection.tableId, range: selection.range });
}

// Запросы к таблице без интерфейса — в движке.
export { cellOfRange, visibleCell } from '@inkbrick/engine/internal';
