import {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
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
import { TableHeaderRowContext, TableMergeContext, type MergedCell } from './TableMergeContext';
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
  const view = useEditorView();
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

  // Выделены ячейки этой таблицы: CSS прячет обычную подсветку текста. Атрибут, а не `:has([data-cell-selected])`:
  // с `:has` браузер пересчитывал стили всех ячеек при каждой правке внутри таблицы (сотни мс на клавишу в 100 × 20).
  const cellsSelected = useSyncExternalStore(
    view.cells.subscribe,
    () => view.cells.get()?.tableId === block.id,
    () => false,
  );

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
      data-cells-selected={cellsSelected || undefined}
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
          <TableHeaderRowContext.Provider
            value={header !== false ? (block.children[0] ?? null) : null}
          >
            <TableMergeContext.Provider value={merged}>
              <Children id={block.id} />
            </TableMergeContext.Provider>
          </TableHeaderRowContext.Provider>
        </tbody>
      </table>
      {!readOnly && <TableControls block={block} tableRef={table} onPreview={setPreview} />}
    </div>
  );
}

export function TableRowBlock({ block }: BlockProps) {
  const editor = useEditor();
  const ref = useRef<HTMLTableRowElement>(null);
  const cells = block.children.length;
  // Первая строка задаёт число столбцов: по нему таблица не уже своего минимума. Строка перерисовывается, когда
  // меняются её ячейки (добавили или удалили столбец), а сама таблица на это не реагирует.
  const first = editor.store.getBlock(block.parentId ?? '')?.children[0] === block.id;

  useLayoutEffect(() => {
    if (!first) return;

    const table = ref.current?.closest('table');

    // Ячейка не уже своего минимума: при многих столбцах таблица шире блока и прокручивается, а не сжимает ячейки.
    if (table) table.style.minWidth = `${cells * MIN_CELL_WIDTH}px`;
  }, [cells, first]);

  return (
    <tr ref={ref} data-inkbrick-block="table-row" data-block-id={block.id}>
      <Children id={block.id} />
    </tr>
  );
}

/** Наименьшая ширина ячейки в пикселях: совпадает с `min-width` ячейки в стилях. */
const MIN_CELL_WIDTH = 64;

/** Толщина границы с одной стороны ячейки; `undefined` — сторона не задана. */
function borderOf(block: BlockProps['block'], key: string): TableBorderWidth | undefined {
  const value = block.props[key];

  return TABLE_BORDER_WIDTHS.includes(value as TableBorderWidth)
    ? (value as TableBorderWidth)
    : undefined;
}

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/**
 * Свой цвет фона ячейки (`#rrggbb`): текст на нём чёрный или белый — тот, что контрастнее (относительная яркость WCAG).
 * Полупрозрачный фон (`#rrggbbaa` с прозрачностью больше половины) почти не меняет страницу под собой: текст остаётся
 * цветом темы.
 */
function readableText(background: unknown): CSSProperties | undefined {
  if (typeof background !== 'string' || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(background))
    return undefined;
  if (background.length === 9 && parseInt(background.slice(7), 16) < 128) return undefined;

  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(background.slice(at, at + 2), 16) / 255;

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Контраст с чёрным (L + 0.05) / 0.05 против контраста с белым 1.05 / (L + 0.05): равны при L ≈ 0.179.
  const light = luminance < 0.179;

  return {
    '--inkbrick-cell-text': `var(--inkbrick-cell-text-${light ? 'light' : 'dark'})`,
  } as CSSProperties;
}

/**
 * Свой цвет и начертание сторон ячейки (`borderTopColor`, `borderTopStyle`…) — встроенным стилем: общая линия двух ячеек
 * красится у обеих, а остальные стороны соседа остаются прежними. Сторона «без линии» остаётся прозрачной. В `style`
 * попадают только имена из палитры и начертания из схемы.
 */
function sideLook(block: BlockProps['block']): CSSProperties {
  const style: Record<string, string> = {};

  for (const side of SIDES) {
    if (block.props[`border${side}`] === 'none') continue;

    // Своё у стороны, иначе общее на ячейку (`borderColor`, `borderStyle` старых документов).
    const color = block.props[`border${side}Color`] ?? block.props.borderColor;
    const line = block.props[`border${side}Style`] ?? block.props.borderStyle;

    if (isColorName(color))
      style[`border${side}Color`] =
        color === 'black' || color === 'white'
          ? `var(--inkbrick-cell-line-${color})`
          : `var(--inkbrick-color-${color})`;
    if (line === 'dashed' || line === 'dotted') style[`border${side}Style`] = line;
  }

  return style;
}

export function TableCellBlock({ block, selected }: BlockProps) {
  const view = useEditorView();
  const editor = useEditor();
  // Ячейка первой строки заголовочной таблицы: для программ чтения с экрана это заголовок столбца.
  const headerRow = useContext(TableHeaderRowContext);
  const headerCell = headerRow !== null && block.parentId === headerRow;
  const merge = useContext(TableMergeContext).get(block.id);
  const picked = useSyncExternalStore(
    view.cells.subscribe,
    () => view.cells.isSelected(block.id),
    () => false,
  );

  if (merge?.covered) {
    return <td hidden data-inkbrick-block="table-cell" data-block-id={block.id} data-covered="" />;
  }

  const attrs = backgroundAttrs(block);

  return (
    <td
      data-inkbrick-block="table-cell"
      data-block-id={block.id}
      data-align={getBlockAlign(block) ?? 'left'}
      {...attrs}
      style={{ ...attrs.style, ...readableText(block.props.background), ...sideLook(block) }}
      role={headerCell ? 'columnheader' : undefined}
      data-border-top={borderOf(block, 'borderTop')}
      data-border-right={borderOf(block, 'borderRight')}
      data-border-bottom={borderOf(block, 'borderBottom')}
      data-border-left={borderOf(block, 'borderLeft')}
      data-selected={selected || undefined}
      data-cell-selected={picked || undefined}
      colSpan={merge && merge.colSpan > 1 ? merge.colSpan : undefined}
      rowSpan={merge && merge.rowSpan > 1 ? merge.rowSpan : undefined}
      // Нажатие на пустое место ячейки (поля, нижняя часть высокой объединённой ячейки, где текста нет): браузер ставил бы
      // каретку на ближайшую по строке позицию, то есть в соседнюю ячейку, потому что покрытые объединением ячейки скрыты.
      // Каретка ставится в сам текст этой ячейки; то же делает касание пальцем (браузер досылает ему mousedown).
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || event.button !== 0 || event.shiftKey) return;
        if (editor.readOnly) return;

        event.preventDefault();
        view.placeCaret(block.id, editor.engine.inline.length(block.content));
      }}
    >
      <Editable block={block} />
    </td>
  );
}
