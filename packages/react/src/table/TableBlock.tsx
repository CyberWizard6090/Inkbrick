import { getBlockAlign, type TableProps } from '@inkbrick/document';

import type { BlockProps } from '../blocks/BlockProps';
import { Editable } from '../blocks/Editable';
import { useChildren } from '../hooks/useChildren';
import { BlockRenderer } from '../renderer/BlockRenderer';

/*
 * Строки и ячейки выводятся напрямую, а не через рендерер документа: внутри <tbody> и <tr> допустимы только
 * <tr> и <td>, виртуальный рендерер со своими обёртками там не подходит.
 */
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
export function TableBlock({ block, selected }: BlockProps) {
  const { header, widths } = block.props as TableProps;

  return (
    <div
      className="block block-table"
      data-inkbrick-block="table"
      data-block-id={block.id}
      data-selected={selected || undefined}
      data-header={header || undefined}
    >
      <table data-inkbrick-part="grid">
        {widths && (
          <colgroup>
            {widths.map((width, index) => (
              <col key={index} style={width ? { width } : undefined} />
            ))}
          </colgroup>
        )}
        <tbody>
          <Children id={block.id} />
        </tbody>
      </table>
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
