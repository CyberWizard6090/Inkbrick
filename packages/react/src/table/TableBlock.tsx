import { useContext, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  getBlockAlign,
  normalizeMerges,
  type BaseBlock,
  type TableProps,
} from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import type { BlockProps } from '../blocks/BlockProps';
import { Editable } from '../blocks/Editable';
import { useChildren } from '../hooks/useChildren';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { BlockRenderer } from '../renderer/BlockRenderer';
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
  const { header, widths, freezeRow, freezeColumn } = block.props as TableProps;
  const editor = useEditor();
  const table = useRef<HTMLTableElement>(null);
  const merged = useMemo(() => mergedCells(editor, block), [editor, block]);
  // Ширина столбца, которую тянут: рисуется поверх widths, пока перетаскивание не записано в модель.
  const [preview, setPreview] = useState<{ index: number; width: number } | null>(null);
  useCellSelection(block.id, table, !readOnly);

  const columns = preview
    ? Math.max(widths?.length ?? 0, preview.index + 1)
    : (widths?.length ?? 0);

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
      <table ref={table} data-inkbrick-part="grid">
        {columns > 0 && (
          <colgroup>
            {Array.from({ length: columns }, (_, index) => {
              const width = preview?.index === index ? preview.width : widths?.[index];

              return <col key={index} style={width ? { width } : undefined} />;
            })}
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

export function TableCellBlock({ block, selected }: BlockProps) {
  const view = useEditorView();
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
      data-selected={selected || undefined}
      data-cell-selected={picked || undefined}
      colSpan={merge && merge.colSpan > 1 ? merge.colSpan : undefined}
      rowSpan={merge && merge.rowSpan > 1 ? merge.rowSpan : undefined}
    >
      <Editable block={block} />
    </td>
  );
}
