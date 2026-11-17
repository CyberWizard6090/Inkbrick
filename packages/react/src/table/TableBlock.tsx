import { useContext, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  getBlockAlign,
  normalizeMerges,
  type BaseBlock,
  type TableColumnType,
  type TableOption,
  type TableProps,
} from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { BlockProps } from '../blocks/BlockProps';
import { Editable } from '../blocks/Editable';
import { useChildren } from '../hooks/useChildren';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { BlockRenderer } from '../renderer/BlockRenderer';
import { CheckboxControl, ChipsControl, LinkControl } from './ColumnCell';
import { isSelectType } from './columnTypes';
import {
  TableColumnContext,
  TableHiddenRowsContext,
  type TableColumns,
} from './TableColumnContext';
import { filteredRowIds, sortedRowIds } from './tableFilter';
import { isCustomized, useActiveView } from './views';
import { TableViewBar } from './TableViewBar';
import { TableControls } from './TableControls';
import { TableMergeContext, type MergedCell } from './TableMergeContext';
import { useCellSelection } from './useCellSelection';

const NO_MERGES: ReadonlyMap<string, MergedCell> = new Map();
const NO_ROWS: ReadonlySet<string> = new Set();

/** Карта объединённых ячеек таблицы по id ячейки. */
function mergedCells(editor: Editor, table: BaseBlock): ReadonlyMap<string, MergedCell> {
  const rows = table.children.map((id) => editor.store.getBlock(id));
  const columns = rows[0]?.children.length ?? 0;
  const merges = normalizeMerges((table.props as TableProps).merges, rows.length, columns);

  if (merges.length === 0) return NO_MERGES;

  const map = new Map<string, MergedCell>();

  for (const merge of merges) {
    for (let row = merge.row; row < merge.row + merge.rows; row++) {
      for (let column = merge.column; column < merge.column + merge.columns; column++) {
        const id = rows[row]?.children[column];

        if (id) {
          map.set(id, {
            covered: row !== merge.row || column !== merge.column,
            colSpan: merge.columns,
            rowSpan: merge.rows,
          });
        }
      }
    }
  }

  return map;
}

const plainText = (cell: BaseBlock) => cell.content.map((node) => node.insert).join('');

/** Строки таблицы в заданном порядке (сортировка вида). */
function Rows({ ids }: { readonly ids: readonly string[] }) {
  return (
    <>
      {ids.map((id) => (
        <BlockRenderer key={id} id={id} />
      ))}
    </>
  );
}

function Children({ id }: { readonly id: string }) {
  return (
    <>
      {useChildren(id).map((childId) => (
        <BlockRenderer key={childId} id={childId} />
      ))}
    </>
  );
}

/**
 * Таблица. Разметка — обычные `<table>`, `<tr>`, `<td>`; текст ячейки — `<Editable>`, поэтому выделение,
 * форматирование и ввод работают как в любом текстовом блоке. Обёртка прокручивается по горизонтали,
 * если таблица шире документа.
 */
export function TableBlock({ block, selected, readOnly }: BlockProps) {
  const { header, widths, freezeRow, freezeColumn, columnTypes, columnOptions } =
    block.props as TableProps;
  const { views, active, select } = useActiveView(block);
  const columnHidden = active.hidden;
  const columnFilters = active.filters;
  const editor = useEditor();
  const table = useRef<HTMLTableElement>(null);
  const merged = useMemo(() => mergedCells(editor, block), [editor, block]);
  // Ширины, пока границу тянут: рисуются поверх widths, пока перетаскивание не записано в модель.
  const [preview, setPreview] = useState<readonly number[] | null>(null);
  useCellSelection(block.id, table, !readOnly);
  // Только обычные текстовые столбцы — ячейки рисуются как раньше и ничего не ищут.
  const columnKinds = useMemo<TableColumns | null>(
    () =>
      columnTypes?.some((type) => type && type !== 'text') || columnHidden?.some(Boolean)
        ? {
            header: header !== false,
            types: columnTypes ?? [],
            options: columnOptions ?? [],
            hidden: columnHidden ?? [],
          }
        : null,
    [header, columnTypes, columnOptions, columnHidden],
  );
  // Строки, скрытые фильтрами. Считается при смене фильтров и состава строк, а не при каждой правке текста: строка,
  // которую правят, не пропадает из-под рук; в следующий раз она учтётся заново.
  const hiddenRows = useMemo(
    () =>
      columnFilters?.some(Boolean)
        ? filteredRowIds(block, (id) => editor.store.getBlock(id), plainText, columnFilters)
        : NO_ROWS,
    // `block` меняется вместе с составом строк и свойствами таблицы.
    [editor, block, columnFilters],
  );
  // Порядок показа строк вида; пересчитывается так же, как скрытые строки.
  const rowOrder = useMemo(
    () => sortedRowIds(block, (id) => editor.store.getBlock(id), plainText, active.sort),
    [editor, block, active.sort],
  );
  const hiddenColumns = columnHidden?.filter(Boolean).length ?? 0;
  const filtered = columnFilters?.filter(Boolean).length ?? 0;

  const shown: readonly (number | null | undefined)[] = preview ?? widths ?? [];
  const columns = shown.length;
  // Когда ширина задана у всех столбцов, таблица ровно такой ширины: растягивается только край последнего столбца,
  // остальные границы перераспределяют ширину между соседями. Пока у столбца ширины нет, он занимает остаток.
  const total =
    columns > 0 && shown.every((width): width is number => typeof width === 'number' && width > 0)
      ? shown.reduce((sum, width, index) => sum + (columnHidden?.[index] ? 0 : width), 0)
      : undefined;

  return (
    <div
      className="block block-table"
      data-inkbrick-block="table"
      data-block-id={block.id}
      data-selected={selected || undefined}
      data-header={header || undefined}
      data-freeze-row={freezeRow || undefined}
      data-freeze-column={freezeColumn || undefined}
    >
      {(views.length > 1 || isCustomized(active)) && (
        <TableViewBar
          block={block}
          views={views}
          active={active}
          onSelect={select}
          hiddenColumns={hiddenColumns}
          filters={filtered}
          hiddenRows={hiddenRows.size}
          readOnly={!!readOnly}
        />
      )}
      <table ref={table} data-inkbrick-part="grid" style={total ? { width: total } : undefined}>
        {columns > 0 && (
          <colgroup>
            {shown.map((width, index) => (
              <col
                key={index}
                style={columnHidden?.[index] ? { display: 'none' } : width ? { width } : undefined}
              />
            ))}
          </colgroup>
        )}
        <tbody>
          <TableMergeContext.Provider value={merged}>
            <TableColumnContext.Provider value={columnKinds}>
              <TableHiddenRowsContext.Provider value={hiddenRows}>
                {rowOrder ? <Rows ids={rowOrder} /> : <Children id={block.id} />}
              </TableHiddenRowsContext.Provider>
            </TableColumnContext.Provider>
          </TableMergeContext.Provider>
        </tbody>
      </table>
      {!readOnly && (
        <TableControls
          block={block}
          tableRef={table}
          activeView={active}
          onSelectView={select}
          onPreview={setPreview}
        />
      )}
    </div>
  );
}

export function TableRowBlock({ block }: BlockProps) {
  const hidden = useContext(TableHiddenRowsContext).has(block.id);

  return (
    <tr
      data-inkbrick-block="table-row"
      data-block-id={block.id}
      hidden={hidden || undefined}
      data-filtered={hidden || undefined}
    >
      <Children id={block.id} />
    </tr>
  );
}

/** Тип и варианты столбца ячейки; `null` — обычная текстовая ячейка (заголовок остаётся текстом). */
function useCellColumn(block: BaseBlock): {
  type: TableColumnType;
  options: readonly TableOption[] | null | undefined;
  hidden: boolean;
} | null {
  const editor = useEditor();
  const columns = useContext(TableColumnContext);

  if (!columns) return null;

  const row = block.parentId ? editor.store.getBlock(block.parentId) : undefined;
  const table = row?.parentId ? editor.store.getBlock(row.parentId) : undefined;
  const column = row ? row.children.indexOf(block.id) : -1;
  const hidden = !!columns.hidden[column];
  const type = columns.types[column] ?? 'text';

  if (!row || !table || column < 0) return null;
  // Заголовок остаётся текстом, но скрытый столбец скрывает и его.
  if (columns.header && table.children[0] === row.id)
    return { type: 'text', options: null, hidden };

  return { type, options: columns.options[column], hidden };
}

export function TableCellBlock({ block, selected, readOnly }: BlockProps) {
  const view = useEditorView();
  const column = useCellColumn(block);
  const merge = useContext(TableMergeContext).get(block.id);
  const picked = useSyncExternalStore(
    view.cells.subscribe,
    () => view.cells.isSelected(block.id),
    () => false,
  );

  if (merge?.covered) {
    return <td hidden data-inkbrick-block="table-cell" data-block-id={block.id} data-covered="" />;
  }

  return (
    <td
      data-inkbrick-block="table-cell"
      data-block-id={block.id}
      hidden={column?.hidden || undefined}
      data-align={getBlockAlign(block) ?? 'left'}
      data-column-type={column && column.type !== 'text' ? column.type : undefined}
      data-selected={selected || undefined}
      data-cell-selected={picked || undefined}
      colSpan={merge && merge.colSpan > 1 ? merge.colSpan : undefined}
      rowSpan={merge && merge.rowSpan > 1 ? merge.rowSpan : undefined}
    >
      {column?.type === 'checkbox' && <CheckboxControl block={block} readOnly={!!readOnly} />}
      {column && isSelectType(column.type) && (
        <ChipsControl
          block={block}
          options={column.options}
          readOnly={!!readOnly}
          multiple={column.type === 'multiselect'}
        />
      )}
      <Editable block={block} />
      {column && column.type !== 'text' && <LinkControl block={block} type={column.type} />}
    </td>
  );
}
