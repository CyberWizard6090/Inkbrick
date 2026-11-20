import { flushSync } from 'react-dom';

import { normalizeMerges } from '@inkbrick/document';
import {
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  locateTableCell,
  mergeAt,
  tableSize,
  type CaretResult,
} from '@inkbrick/engine';

import type { BlockContextMenuContext } from '../blocks/defineBlock';
import type { ContextMenuItem } from '../context-menu/types';
import type { CellSelection } from '../editing/CellSelectionController';
import { Icon } from '../icons/Icon';
import type { MessageKey } from '../i18n/en';
import { visibleCell } from './cellSelection';
import { tableDesignMenuItems } from './TableDesignPanels';
import { tableFormatActions } from './tableFormatActions';

/** Правый клик в ячейке: вставить и удалить строку и столбец, в которых стоит курсор. */
export function tableContextMenu({
  editor,
  view,
  selection,
  t,
  close,
}: BlockContextMenuContext): readonly ContextMenuItem[] {
  const getBlock = (id: string) => editor.store.getBlock(id);
  const picked = view.cells.get();
  const cell = selection ? locateTableCell(getBlock, selection.from.blockId) : undefined;
  const tableId = picked?.tableId ?? cell?.tableId;
  const size = tableId ? tableSize(getBlock, tableId) : undefined;

  if (!tableId || !size) return [];

  const row = picked?.head.row ?? cell?.row ?? 0;
  const column = picked?.head.column ?? cell?.column ?? 0;
  const merges = normalizeMerges(getBlock(tableId)?.props.merges, size.rows, size.columns);
  const inMerge = mergeAt(merges, row, column);
  // Выделен диапазон ячеек — строки и столбцы, которые он охватывает, вставляются и удаляются все сразу.
  const span = picked?.range ?? { top: row, bottom: row, left: column, right: column };
  const rowCount = span.bottom - span.top + 1;
  const columnCount = span.right - span.left + 1;
  const canAddRows = size.rows * size.columns + rowCount * size.columns <= MAX_TABLE_CELLS;
  const canAddColumns =
    size.columns + columnCount <= MAX_TABLE_COLUMNS &&
    size.rows * (size.columns + columnCount) <= MAX_TABLE_CELLS;
  const many = (count: number, single: MessageKey, plural: MessageKey) =>
    count > 1 ? t(plural, { count }) : t(single);
  const times = (count: number, index: (step: number) => number) =>
    Array.from({ length: count }, (_, step) => ({ index: index(step) }));

  const perform = (type: string, payload: Record<string, unknown>, target: () => CaretResult) => {
    editor.sealHistory();
    flushSync(() => {
      view.cells.clear();
      editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);
    });

    const caret = target();

    if (view.getElement(caret.blockId)) view.placeCaret(caret.blockId, caret.offset);
  };

  /** Несколько команд одним шагом отмены (вставка и удаление нескольких строк или столбцов). */
  const performMany = (
    type: string,
    payloads: readonly Record<string, unknown>[],
    target: () => CaretResult,
  ) => {
    editor.sealHistory();
    flushSync(() => {
      view.cells.clear();
      editor.batch(() => {
        for (const payload of payloads)
          editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);
      });
    });

    const caret = target();

    if (view.getElement(caret.blockId)) view.placeCaret(caret.blockId, caret.offset);
  };

  const at = (r: number, c: number): CaretResult => ({
    blockId: visibleCell(editor, tableId, r, c).id ?? '',
    offset: 0,
  });
  const after = (r: number, c: number) => () => {
    const next = tableSize(getBlock, tableId);

    return at(Math.min(r, (next?.rows ?? 1) - 1), Math.min(c, (next?.columns ?? 1) - 1));
  };

  const items: ContextMenuItem[] = [];

  if (
    picked &&
    picked.ids.size > 1 &&
    editor.can('mergeTableCells', { blockId: tableId, range: picked.range })
  ) {
    items.push({
      id: 'table-merge',
      title: t('table.cells.merge'),
      icon: <Icon name="table" />,
      run: () =>
        perform(
          'mergeTableCells',
          { range: picked.range },
          after(picked.range.top, picked.range.left),
        ),
    });
  }

  if (inMerge) {
    items.push({
      id: 'table-split',
      title: t('table.cells.split'),
      icon: <Icon name="table" />,
      run: () =>
        perform('splitTableCell', { row, column }, after(inMerge.merge.row, inMerge.merge.column)),
    });
  }

  const tableBlock = getBlock(tableId);
  // Форматирование таблицы: заголовки, полосатость, границы, закрепление, ширины.
  const format = tableBlock
    ? tableFormatActions(editor, tableBlock, t, (action) => {
        editor.sealHistory();
        flushSync(() => {
          action();
        });
      }).map((item, index): ContextMenuItem => ({ ...item, separatorBefore: index === 0 }))
    : [];

  // Фон ячейки и границы относятся к выделенным ячейкам, а без выделения — к одной ячейке под куркором, а не ко всей таблице.
  const single: CellSelection | null =
    !picked && cell && selection
      ? {
          tableId,
          anchor: { row: cell.row, column: cell.column },
          head: { row: cell.row, column: cell.column },
          range: { top: cell.row, left: cell.column, bottom: cell.row, right: cell.column },
          ids: new Set([selection.from.blockId]),
        }
      : null;

  // Фон ячейки, границы и стиль таблицы: вложенные меню; действие закрывает меню.
  const design = tableBlock
    ? tableDesignMenuItems(editor, tableBlock, t, picked ?? single, (action) => {
        editor.sealHistory();
        flushSync(() => {
          action();
        });
        close();
      })
    : [];

  return [
    ...items,
    {
      id: 'table-row-above',
      title: many(rowCount, 'table.row.insertAbove', 'table.rows.insertAbove'),
      icon: <Icon name="plus" />,
      disabled: !canAddRows,
      run: () =>
        performMany(
          'insertTableRow',
          times(rowCount, () => span.top),
          after(span.top, column),
        ),
    },
    {
      id: 'table-row-below',
      title: many(rowCount, 'table.row.insertBelow', 'table.rows.insertBelow'),
      icon: <Icon name="plus" />,
      disabled: !canAddRows,
      run: () =>
        performMany(
          'insertTableRow',
          times(rowCount, () => span.bottom + 1),
          after(span.bottom + 1, column),
        ),
    },
    {
      id: 'table-row-delete',
      title: many(rowCount, 'table.row.delete', 'table.rows.delete'),
      icon: <Icon name="trash" />,
      disabled: rowCount >= size.rows,
      // С нижней строки к верхней: номера оставшихся строк не сдвигаются.
      run: () =>
        performMany(
          'deleteTableRow',
          times(rowCount, (step) => span.bottom - step),
          after(span.top, column),
        ),
    },
    {
      id: 'table-column-left',
      title: many(columnCount, 'table.column.insertLeft', 'table.columns.insertLeft'),
      icon: <Icon name="plus" />,
      disabled: !canAddColumns,
      run: () =>
        performMany(
          'insertTableColumn',
          times(columnCount, () => span.left),
          after(row, span.left),
        ),
    },
    {
      id: 'table-column-right',
      title: many(columnCount, 'table.column.insertRight', 'table.columns.insertRight'),
      icon: <Icon name="plus" />,
      disabled: !canAddColumns,
      run: () =>
        performMany(
          'insertTableColumn',
          times(columnCount, () => span.right + 1),
          after(row, span.right + 1),
        ),
    },
    {
      id: 'table-column-delete',
      title: many(columnCount, 'table.column.delete', 'table.columns.delete'),
      icon: <Icon name="trash" />,
      disabled: columnCount >= size.columns,
      run: () =>
        performMany(
          'deleteTableColumn',
          times(columnCount, (step) => span.right - step),
          after(row, span.left),
        ),
    },
    // Ширина столбца с клавиатуры: ручки ширины на разделителях доступны только мышью.
    ...widthItems(column),
    ...format,
    ...design,
  ];

  /** Шире и уже на шаг от текущей ширины столбца под курсором (или выделением). */
  function widthItems(index: number): ContextMenuItem[] {
    const id = visibleCell(editor, tableId!, row, index).id;
    const td = id ? view.getElement(id)?.closest('td') : null;
    const measured = td ? columnWidth(td, index) : 0;
    const current = getBlock(tableId!)?.props.widths;
    const saved = Array.isArray(current) ? current[index] : undefined;
    const start = typeof saved === 'number' && saved > 0 ? saved : measured;
    const resize = (delta: number) => {
      const width = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, Math.round(start + delta)),
      );

      return () => perform('setTableColumnWidth', { index, width }, after(row, index));
    };
    const disabled = (width: number) =>
      !editor.can('setTableColumnWidth', { blockId: tableId, index, width });

    if (!(start > 0)) return [];

    return [
      {
        id: 'table-column-wider',
        title: t('table.column.wider'),
        icon: <Icon name="arrow-right" />,
        disabled: disabled(start + KEY_WIDTH_STEP) || start + KEY_WIDTH_STEP > MAX_COLUMN_WIDTH,
        run: resize(KEY_WIDTH_STEP),
      },
      {
        id: 'table-column-narrower',
        title: t('table.column.narrower'),
        icon: <Icon name="arrow-left" />,
        disabled: disabled(start - KEY_WIDTH_STEP) || start - KEY_WIDTH_STEP < MIN_COLUMN_WIDTH,
        run: resize(-KEY_WIDTH_STEP),
      },
    ];
  }
}

const MIN_COLUMN_WIDTH = 40;
const MAX_COLUMN_WIDTH = 1200;
const KEY_WIDTH_STEP = 10;

/**
 * Ширина столбца `index` на экране: по первой его ячейке без объединения (скрытые ячейки объединений остаются в DOM,
 * поэтому номер ячейки в строке — номер столбца). Если такой нет, — доля объединённой ячейки на столбец.
 */
function columnWidth(td: HTMLTableCellElement, index: number): number {
  for (const row of td.closest('table')?.rows ?? []) {
    const cell = row.cells[index];

    if (cell && !cell.hidden && cell.colSpan <= 1) return cell.getBoundingClientRect().width;
  }

  return td.getBoundingClientRect().width / Math.max(1, td.colSpan);
}
