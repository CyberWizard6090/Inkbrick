import { flushSync } from 'react-dom';

import {
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  locateTableCell,
  tableCellAt,
  tableSize,
  type CaretResult,
} from '@inkbrick/engine';

import type { BlockContextMenuContext } from '../blocks/defineBlock';
import type { ContextMenuItem } from '../context-menu/types';
import { Icon } from '../icons/Icon';

/** Правый клик в ячейке: вставить и удалить строку и столбец, в которых стоит курсор. */
export function tableContextMenu({
  editor,
  view,
  selection,
  t,
}: BlockContextMenuContext): readonly ContextMenuItem[] {
  if (!selection) return [];

  const getBlock = (id: string) => editor.store.getBlock(id);
  const cell = locateTableCell(getBlock, selection.from.blockId);
  const size = cell && tableSize(getBlock, cell.tableId);

  if (!cell || !size) return [];

  const { tableId, row, column } = cell;
  const canAddRow = size.rows * size.columns + size.columns <= MAX_TABLE_CELLS;
  const canAddColumn =
    size.columns < MAX_TABLE_COLUMNS && size.rows * (size.columns + 1) <= MAX_TABLE_CELLS;

  const perform = (type: string, payload: Record<string, unknown>, target: () => CaretResult) => {
    editor.sealHistory();
    flushSync(() => {
      editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);
    });

    const caret = target();

    if (view.getElement(caret.blockId)) view.placeCaret(caret.blockId, caret.offset);
  };

  const at = (r: number, c: number): CaretResult => ({
    blockId: tableCellAt(getBlock, tableId, r, c) ?? selection.from.blockId,
    offset: 0,
  });
  const after = (r: number, c: number) => () => {
    const next = tableSize(getBlock, tableId);

    return at(Math.min(r, (next?.rows ?? 1) - 1), Math.min(c, (next?.columns ?? 1) - 1));
  };

  return [
    {
      id: 'table-row-above',
      title: t('table.row.insertAbove'),
      icon: <Icon name="plus" />,
      disabled: !canAddRow,
      run: () => perform('insertTableRow', { index: row }, after(row, column)),
    },
    {
      id: 'table-row-below',
      title: t('table.row.insertBelow'),
      icon: <Icon name="plus" />,
      disabled: !canAddRow,
      run: () => perform('insertTableRow', { index: row + 1 }, after(row + 1, column)),
    },
    {
      id: 'table-row-delete',
      title: t('table.row.delete'),
      icon: <Icon name="trash" />,
      disabled: size.rows < 2,
      run: () => perform('deleteTableRow', { index: row }, after(row, column)),
    },
    {
      id: 'table-column-left',
      title: t('table.column.insertLeft'),
      icon: <Icon name="plus" />,
      disabled: !canAddColumn,
      run: () => perform('insertTableColumn', { index: column }, after(row, column)),
    },
    {
      id: 'table-column-right',
      title: t('table.column.insertRight'),
      icon: <Icon name="plus" />,
      disabled: !canAddColumn,
      run: () => perform('insertTableColumn', { index: column + 1 }, after(row, column + 1)),
    },
    {
      id: 'table-column-delete',
      title: t('table.column.delete'),
      icon: <Icon name="trash" />,
      disabled: size.columns < 2,
      run: () => perform('deleteTableColumn', { index: column }, after(row, column)),
    },
  ];
}
