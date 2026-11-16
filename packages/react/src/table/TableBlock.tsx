import { useRef, useState } from 'react';

import { getBlockAlign, type TableProps } from '@inkbrick/document';

import type { BlockProps } from '../blocks/BlockProps';
import { Editable } from '../blocks/Editable';
import { useChildren } from '../hooks/useChildren';
import { BlockRenderer } from '../renderer/BlockRenderer';
import { TableControls } from './TableControls';

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
  const { header, widths } = block.props as TableProps;
  const table = useRef<HTMLTableElement>(null);
  // Ширина столбца, которую тянут: рисуется поверх widths, пока перетаскивание не записано в модель.
  const [preview, setPreview] = useState<{ index: number; width: number } | null>(null);
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
          <Children id={block.id} />
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
  return (
    <td
      data-inkbrick-block="table-cell"
      data-block-id={block.id}
      data-align={getBlockAlign(block) ?? 'left'}
      data-selected={selected || undefined}
    >
      <Editable block={block} />
    </td>
  );
}
