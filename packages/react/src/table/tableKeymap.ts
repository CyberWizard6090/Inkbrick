import { normalizeMerges } from '@inkbrick/document';
import {
  locateTableCell,
  mergeAt,
  tableCellAt,
  tableSize,
  type CaretResult,
} from '@inkbrick/engine';

import type { KeyBinding, KeymapContext } from '../keymap/types';

function cellAtCaret(context: KeymapContext) {
  const selection = context.selection();

  if (!selection || selection.from.blockId !== selection.to.blockId) return undefined;

  return locateTableCell((id) => context.editor.store.getBlock(id), selection.from.blockId);
}

/** Tab и Shift+Tab: следующая и предыдущая ячейка, по строкам. Tab в последней ячейке добавляет строку. */
const step = (direction: 1 | -1) => (context: KeymapContext) => {
  const { editor, view } = context;
  const getBlock = (id: string) => editor.store.getBlock(id);
  const cell = cellAtCaret(context);
  const size = cell && tableSize(getBlock, cell.tableId);

  if (!cell || !size) return false;

  const merges = normalizeMerges(getBlock(cell.tableId)?.props.merges, size.rows, size.columns);
  const covered = (at: number) => {
    const found = mergeAt(merges, Math.floor(at / size.columns), at % size.columns);

    return !!found && !found.origin;
  };
  let index = cell.row * size.columns + cell.column + direction;

  while (index >= 0 && index < size.rows * size.columns && covered(index)) index += direction;

  if (index < 0) return;

  if (index >= size.rows * size.columns) {
    context.run(() =>
      context.exec<CaretResult>({
        type: 'insertTableRow',
        payload: { blockId: cell.tableId, index: size.rows },
      } as never),
    );
    return;
  }

  const target = tableCellAt(
    getBlock,
    cell.tableId,
    Math.floor(index / size.columns),
    index % size.columns,
  );
  const block = target ? getBlock(target) : undefined;

  if (block) view.placeCaret(block.id, editor.engine.inline.length(block.content));
};

const inCell = (context: KeymapContext) =>
  !context.view.slash.getState().open && cellAtCaret(context) !== undefined;

/** Ближайший к каретке прямоугольник текста: у пустой строки или в конце строки он может быть пустым. */
function caretRect(): DOMRect | undefined {
  const selection = globalThis.getSelection();

  if (!selection || selection.rangeCount === 0) return undefined;

  const range = selection.getRangeAt(0);

  return range.getClientRects()[0] ?? range.getBoundingClientRect();
}

/**
 * Стрелки вверх и вниз: из последней строки ячейки — в ячейку той же колонки следующей строки, из первой — в предыдущую.
 * Внутри многострочной ячейки стрелка остаётся у браузера (он двигает каретку по строкам), как и у его `Tab`-пути.
 */
const vertical = (direction: 1 | -1) => (context: KeymapContext) => {
  const { editor, view } = context;
  const getBlock = (id: string) => editor.store.getBlock(id);
  const cell = cellAtCaret(context);
  const size = cell && tableSize(getBlock, cell.tableId);
  const blockId = context.selection()?.from.blockId;
  const element = blockId ? view.getElement(blockId) : undefined;
  const rect = caretRect();

  if (!cell || !size || !element || !rect) return false;

  const cellRect = element.getBoundingClientRect();
  // Каретка на последней (или первой) строке ячейки: до её края меньше одной строки текста.
  // Порог — половина высоты ячейки: у однострочной ячейки это надёжно отличает последнюю строку от первой.
  const reach = Math.max(6, cellRect.height / 2);
  const edge =
    direction === 1 ? rect.bottom >= cellRect.bottom - reach : rect.top <= cellRect.top + reach;

  if (!edge) return false;

  const row = cell.row + direction;

  if (row < 0 || row >= size.rows) return false;

  const merges = normalizeMerges(getBlock(cell.tableId)?.props.merges, size.rows, size.columns);
  const covered = (r: number) => {
    const found = mergeAt(merges, r, cell.column);

    return !!found && !found.origin;
  };
  let target = row;

  while (target >= 0 && target < size.rows && covered(target)) target += direction;

  if (target < 0 || target >= size.rows) return false;

  const id = tableCellAt(getBlock, cell.tableId, target, cell.column);
  const block = id ? getBlock(id) : undefined;

  if (block) view.placeCaret(block.id, 0);

  return true;
};

export const tableKeymap: readonly KeyBinding[] = [
  { id: 'table.nextCell', keys: 'Tab', when: inCell, run: step(1) },
  { id: 'table.previousCell', keys: 'Shift-Tab', when: inCell, run: step(-1) },
  { id: 'table.cellDown', keys: 'ArrowDown', when: inCell, run: vertical(1) },
  { id: 'table.cellUp', keys: 'ArrowUp', when: inCell, run: vertical(-1) },
];
