import { normalizeMerges } from '@inkbrick/document';
import {
  locateTableCell,
  mergeAt,
  tableCellAt,
  tableSize,
  type CaretResult,
} from '@inkbrick/engine';

import type { KeyBinding, KeymapContext } from '../keymap/types';
import { isChecked } from './columnTypes';

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
  const rowIds = getBlock(cell.tableId)?.children ?? [];
  // Скрытое видом (фильтр, скрытый столбец) читается из разметки: то, что пользователь не видит, Tab пропускает.
  const root = context.view.getRoot();
  const hiddenIn = (selector: string) => !!root?.querySelector(selector)?.hasAttribute('hidden');
  const skipped = (at: number) => {
    const row = Math.floor(at / size.columns);
    const target = tableCellAt(getBlock, cell.tableId, row, at % size.columns);

    return (
      covered(at) ||
      hiddenIn(`[data-inkbrick-block="table-row"][data-block-id="${rowIds[row]}"]`) ||
      (!!target && hiddenIn(`[data-inkbrick-block="table-cell"][data-block-id="${target}"]`))
    );
  };
  let index = cell.row * size.columns + cell.column + direction;

  while (index >= 0 && index < size.rows * size.columns && skipped(index)) index += direction;

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

/** Блок-ячейка под кареткой (если каретка в ячейке). */
const cellBlockId = (context: KeymapContext): string | undefined =>
  cellAtCaret(context) ? context.selection()?.from.blockId : undefined;

/** `<td>` ячейки: у него тип столбца и кнопка выбора. */
const cellElement = (context: KeymapContext, id: string) =>
  context.view.getElement(id)?.closest<HTMLElement>('td') ?? undefined;

/** Столбец ячейки под кареткой: `checkbox`, `select`, `multiselect` и т. д. (из разметки: тип столбца у `<td>`). */
function columnTypeAtCaret(context: KeymapContext): string | undefined {
  const id = cellBlockId(context);

  return id ? cellElement(context, id)?.dataset.columnType : undefined;
}

/** Ячейка-флажок: пробел и Enter переключают значение, каретка остаётся в ячейке. */
const toggleCheckbox = (context: KeymapContext) => {
  const id = cellBlockId(context);
  const block = id ? context.editor.store.getBlock(id) : undefined;

  if (!block || context.editor.readOnly) return false;

  const text = context.editor.engine.inline.toPlainText(block.content);

  context.run(() =>
    context.exec<CaretResult>({
      type: 'replaceText',
      payload: {
        blockId: block.id,
        from: 0,
        to: text.length,
        text: isChecked(text) ? '' : 'true',
      },
    }),
  );
};

/** Ячейка с выбором: Enter и Alt+↓ открывают список вариантов (кнопка ячейки нажимается так же, как мышью). */
const openOptions = (context: KeymapContext) => {
  const id = cellBlockId(context);
  const button = id
    ? cellElement(context, id)?.querySelector<HTMLButtonElement>(
        '[data-inkbrick-part="cell-chips"]',
      )
    : null;

  if (!button || button.disabled || context.editor.readOnly) return false;

  button.click();
};

const inCheckboxCell = (context: KeymapContext) =>
  inCell(context) && !context.event.isComposing && columnTypeAtCaret(context) === 'checkbox';

const inSelectCell = (context: KeymapContext) =>
  inCell(context) &&
  !context.event.isComposing &&
  (columnTypeAtCaret(context) === 'select' || columnTypeAtCaret(context) === 'multiselect');

export const tableKeymap: readonly KeyBinding[] = [
  { id: 'table.nextCell', keys: 'Tab', when: inCell, run: step(1) },
  { id: 'table.previousCell', keys: 'Shift-Tab', when: inCell, run: step(-1) },
  {
    id: 'table.toggleCheckbox',
    keys: ['Space', 'Enter'],
    when: inCheckboxCell,
    run: toggleCheckbox,
  },
  {
    id: 'table.openOptions',
    keys: ['Enter', 'Alt-ArrowDown'],
    when: inSelectCell,
    run: openOptions,
  },
];
