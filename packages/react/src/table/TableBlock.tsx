import {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  getBlockAlign,
  isColorName,
  normalizeMerges,
  TABLE_BORDER_WIDTHS,
  type BaseBlock,
  type TableBorderWidth,
  type TableProps,
} from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { BlockProps } from '../blocks/BlockProps';
import { backgroundAttrs } from '../blocks/backgroundAttrs';
import { Editable } from '../blocks/Editable';
import { useChildren } from '../hooks/useChildren';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import { BlockRenderer } from '../renderer/BlockRenderer';
import { fitWidths } from './fitWidths';
import { TableControls } from './TableControls';
import { TableMergeContext, type MergedCell } from './TableMergeContext';
import { useCellSelection } from './useCellSelection';

const NO_MERGES: ReadonlyMap<string, MergedCell> = new Map();

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
  const t = useT();
  const { header, headerColumn, striped, borders, tableStyle, widths, freezeRow, freezeColumn } =
    block.props as TableProps;
  const editor = useEditor();
  const table = useRef<HTMLTableElement>(null);
  const merged = useMemo(() => mergedCells(editor, block), [editor, block]);
  // Ширины, пока границу тянут: рисуются поверх widths, пока перетаскивание не записано в модель.
  const [preview, setPreview] = useState<readonly number[] | null>(null);
  useCellSelection(block.id, table, !readOnly);

  const holder = useRef<HTMLDivElement>(null);
  // Ширина страницы под таблицу: заданные ширины, которые в неё не помещаются, показываются уменьшенными.
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY);

  useLayoutEffect(() => {
    const element = holder.current;

    if (!element) return;

    const measure = () => {
      // Внешняя граница таблицы (border-collapse) добавляет пиксель сверх суммы ширин: на него место меньше.
      const width = element.clientWidth;

      setAvailable(width > 0 ? width - 1 : Number.POSITIVE_INFINITY);
    };

    measure();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;

    observer?.observe(element);

    return () => observer?.disconnect();
  }, []);

  const shown: readonly (number | null | undefined)[] = fitWidths(
    preview ?? widths ?? [],
    available,
  );
  const columns = shown.length;
  // Когда ширина задана у всех столбцов, таблица ровно такой ширины: растягивается только край последнего столбца,
  // остальные границы перераспределяют ширину между соседями. Пока у столбца ширины нет, он занимает остаток.
  const total =
    columns > 0 && shown.every((width): width is number => typeof width === 'number' && width > 0)
      ? shown.reduce((sum, width) => sum + width, 0)
      : undefined;

  return (
    <div
      ref={holder}
      className="block block-table"
      data-inkbrick-block="table"
      data-block-id={block.id}
      data-selected={selected || undefined}
      data-header={header || undefined}
      data-header-column={headerColumn || undefined}
      data-striped={striped || undefined}
      data-borders={borders === false ? 'none' : undefined}
      data-table-style={tableStyle && tableStyle !== 'plain' ? tableStyle : undefined}
      data-freeze-row={freezeRow || undefined}
      data-freeze-column={freezeColumn || undefined}
    >
      <table
        ref={table}
        data-inkbrick-part="grid"
        aria-label={t('table.name')}
        style={total ? { width: total } : undefined}
      >
        {columns > 0 && (
          <colgroup>
            {shown.map((width, index) => (
              <col key={index} style={width ? { width } : undefined} />
            ))}
          </colgroup>
        )}
        <tbody>
          <TableMergeContext.Provider value={merged}>
            <Children id={block.id} />
          </TableMergeContext.Provider>
        </tbody>
      </table>
      {!readOnly && <TableControls block={block} tableRef={table} onPreview={setPreview} />}
    </div>
  );
}

export function TableRowBlock({ block }: BlockProps) {
  return (
    <tr data-inkbrick-block="table-row" data-block-id={block.id}>
      <Children id={block.id} />
    </tr>
  );
}

/** Толщина границы с одной стороны ячейки; `undefined` — сторона не задана. */
function borderOf(block: BlockProps['block'], key: string): TableBorderWidth | undefined {
  const value = block.props[key];

  return TABLE_BORDER_WIDTHS.includes(value as TableBorderWidth)
    ? (value as TableBorderWidth)
    : undefined;
}

export function TableCellBlock({ block, selected }: BlockProps) {
  const view = useEditorView();
  const editor = useEditor();
  const t = useT();
  // Ячейка первой строки заголовочной таблицы: для программ чтения с экрана это заголовок столбца.
  const row = editor.store.getBlock(block.parentId ?? '');
  const tableBlock = row ? editor.store.getBlock(row.parentId ?? '') : undefined;
  const headerCell =
    !!tableBlock && tableBlock.props.header !== false && tableBlock.children[0] === row?.id;
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
      data-align={getBlockAlign(block) ?? 'left'}
      {...backgroundAttrs(block)}
      role={headerCell ? 'columnheader' : undefined}
      data-border-top={borderOf(block, 'borderTop')}
      data-border-right={borderOf(block, 'borderRight')}
      data-border-bottom={borderOf(block, 'borderBottom')}
      data-border-left={borderOf(block, 'borderLeft')}
      data-border-color={isColorName(block.props.borderColor) ? block.props.borderColor : undefined}
      data-border-style={
        block.props.borderStyle === 'dashed' || block.props.borderStyle === 'dotted'
          ? block.props.borderStyle
          : undefined
      }
      data-selected={selected || undefined}
      data-cell-selected={picked || undefined}
      colSpan={merge && merge.colSpan > 1 ? merge.colSpan : undefined}
      rowSpan={merge && merge.rowSpan > 1 ? merge.rowSpan : undefined}
    >
      <Editable block={block} />
    </td>
  );
}
