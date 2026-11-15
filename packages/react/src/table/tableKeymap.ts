import { locateTableCell, tableCellAt, tableSize, type CaretResult } from '@inkbrick/engine';

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

  const index = cell.row * size.columns + cell.column + direction;

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

export const tableKeymap: readonly KeyBinding[] = [
  { id: 'table.nextCell', keys: 'Tab', when: inCell, run: step(1) },
  { id: 'table.previousCell', keys: 'Shift-Tab', when: inCell, run: step(-1) },
];
