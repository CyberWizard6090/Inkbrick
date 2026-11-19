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
import { Icon } from '../icons/Icon';
import { visibleCell } from './cellSelection';
import { tableDesignPanels } from './TableDesignPanels';
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
  const canAddRow = size.rows * size.columns + size.columns <= MAX_TABLE_CELLS;
  const canAddColumn =
    size.columns < MAX_TABLE_COLUMNS && size.rows * (size.columns + 1) <= MAX_TABLE_CELLS;

  const perform = (type: string, payload: Record<string, unknown>, target: () => CaretResult) => {
    editor.sealHistory();
    flushSync(() => {
      view.cells.clear();
      editor.dispatch({ type, payload: { blockId: tableId, ...payload } } as never);
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

  // Стили и границы: те же секции, что в меню ручки таблицы; действие закрывает меню.
  const design = tableBlock
    ? tableDesignPanels(editor, tableBlock, t, picked, (action) => {
        editor.sealHistory();
        flushSync(() => {
          action();
        });
        close();
      }).map((panel, index): ContextMenuItem => ({
        id: panel.id,
        title: panel.title,
        content: panel.content,
        separatorBefore: index === 0,
        run: () => undefined,
      }))
    : [];

  return [
    ...items,
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
    ...format,
    ...design,
  ];
}
