import type { BlockId } from '@inkbrick/document';
import {
  clampTableRange,
  tableCellAt,
  tableRangeBetween,
  tableRangeCells,
  tableSize,
  type Editor,
  type TableCellRef,
  type TableRange,
} from '@inkbrick/engine';

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
  const range = clampTableRange(getBlock, tableId, tableRangeBetween(anchor, head));

  if (!range) {
    view.cells.clear();
    return null;
  }

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

/** Очищает текст выделенных ячеек одним шагом undo; таблица и ячейки остаются. */
export function clearTableCells(editor: Editor, ids: Iterable<BlockId>): void {
  editor.sealHistory();
  editor.batch(() => {
    for (const id of ids) {
      const length = editor.engine.inline.length(editor.store.getBlock(id)?.content ?? []);

      if (length > 0) {
        editor.dispatch({ type: 'deleteText', payload: { blockId: id, from: 0, to: length } });
      }
    }
  });
}

/** Ячейка выделения в точке: для курсора после выхода из выделения. */
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
