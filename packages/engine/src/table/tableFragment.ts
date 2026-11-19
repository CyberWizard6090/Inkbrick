import {
  TABLE,
  TABLE_CELL,
  TABLE_ROW,
  isAlignment,
  type Alignment,
  type TableColumnType,
  type TableMerge,
  type InlineNode,
} from '@inkbrick/document';

import type { Fragment, FragmentBlock } from '../clipboard/types';

/** Предел размера таблицы, которая принимается из буфера обмена: больше — вставляется строками текста. */
export const MAX_TABLE_CELLS = 2000;
export const MAX_TABLE_COLUMNS = 50;

/** Ячейка: простой текст (переводы строк сохраняются) или текст с форматированием. */
export type TableCellInput = string | readonly InlineNode[];

export interface TableFragmentOptions {
  /** Первая строка — заголовок (по умолчанию да). */
  header?: boolean;
  /** Первый столбец — заголовок; чередующиеся строки; `false` — без границ. */
  headerColumn?: boolean;
  striped?: boolean;
  borders?: boolean;
  /** Первая строка и первый столбец остаются на виду при прокрутке. */
  freezeRow?: boolean;
  freezeColumn?: boolean;
  /** Типы столбцов по порядку (`text`, `number`, `date`). */
  columnTypes?: readonly TableColumnType[];
  /** Объединённые ячейки. */
  merges?: readonly TableMerge[];
  /** Выравнивание столбцов по порядку. */
  align?: readonly (Alignment | undefined)[];
  /** Ширины столбцов в пикселях по порядку; `null` — по содержимому. */
  widths?: readonly (number | null)[];
  /** Свои props ячеек по строкам и столбцам (выравнивание и фон отдельных ячеек); поверх выравнивания столбцов. */
  cellProps?: readonly (readonly (Readonly<Record<string, unknown>> | undefined)[])[];
}

const contentOf = (cell: TableCellInput | undefined): InlineNode[] =>
  cell === undefined || cell === ''
    ? []
    : typeof cell === 'string'
      ? [{ insert: cell }]
      : cell.filter((node) => node.insert !== '').map((node) => structuredClone(node));

const block = (
  flavour: string,
  props: Record<string, unknown>,
  content: InlineNode[],
  children: FragmentBlock[],
): FragmentBlock => ({ flavour, props, content, children });

/**
 * Таблица из строк ячеек: фрагмент, который вставляется командой `pasteFragment` (или кладётся в буфер обмена).
 * Строки разной длины дополняются пустыми ячейками. Без строк (или без ячеек) фрагмент пуст.
 *
 * ```ts
 * editor.dispatch({
 *   type: 'pasteFragment',
 *   payload: { at: { blockId, offset: 0 }, fragment: tableFragment([['Name', 'Qty'], ['Apple', '3']]) },
 * });
 * ```
 */
export function tableFragment(
  rows: readonly (readonly TableCellInput[])[],
  options: TableFragmentOptions = {},
): Fragment {
  const columns = Math.max(0, ...rows.map((row) => row.length));

  if (rows.length === 0 || columns === 0) return { blocks: [] };

  const props: Record<string, unknown> = { header: options.header ?? true };

  if (options.headerColumn) props.headerColumn = true;
  if (options.striped) props.striped = true;
  if (options.borders === false) props.borders = false;
  if (options.freezeRow) props.freezeRow = true;
  if (options.freezeColumn) props.freezeColumn = true;
  if (options.merges?.length) props.merges = options.merges.map((merge) => ({ ...merge }));
  if (options.columnTypes?.some((type) => type !== 'text'))
    props.columnTypes = [...options.columnTypes];

  if (options.widths?.some((width) => width !== null)) props.widths = [...options.widths];

  return {
    blocks: [
      {
        ...block(
          TABLE,
          props,
          [],
          rows.map((row, rowIndex) =>
            block(
              TABLE_ROW,
              {},
              [],
              Array.from({ length: columns }, (_, column) => {
                const align = options.align?.[column];
                const own = options.cellProps?.[rowIndex]?.[column];

                return block(
                  TABLE_CELL,
                  { ...(align && align !== 'left' ? { align } : {}), ...own },
                  contentOf(row[column]),
                  [],
                );
              }),
            ),
          ),
        ),
        complete: true,
      },
    ],
  };
}

export interface TableGrid {
  readonly header: boolean;
  /** Содержимое ячеек по строкам; во всех строках поровну ячеек. */
  readonly rows: readonly (readonly InlineNode[][])[];
  readonly align: readonly (Alignment | undefined)[];
  readonly widths: readonly (number | null)[];
  /** Свойства каждой ячейки (фон, границы, выравнивание и цвет линий) по строкам и столбцам; без них — пустой объект. */
  readonly cellProps: readonly (readonly Record<string, unknown>[])[];
}

const isRow = (item: FragmentBlock) => item.flavour === TABLE_ROW;
const isCell = (item: FragmentBlock) => item.flavour === TABLE_CELL;

/** Строки и ячейки блока-таблицы фрагмента; лишние потомки пропускаются, короткие строки дополняются. */
export function readTable(table: FragmentBlock): TableGrid {
  const rows = table.children.filter(isRow).map((row) => row.children.filter(isCell));
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const widths = table.props.widths;
  const alignOf = (cell: FragmentBlock | undefined) =>
    isAlignment(cell?.props.align) ? cell!.props.align : undefined;

  return {
    header: table.props.header !== false,
    rows: rows.map((row) =>
      Array.from({ length: columns }, (_, column) => row[column]?.content ?? []),
    ),
    cellProps: rows.map((row) =>
      Array.from({ length: columns }, (_, column) => row[column]?.props ?? {}),
    ),
    align: Array.from({ length: columns }, (_, column) => alignOf(rows[0]?.[column])),
    widths: Array.from({ length: columns }, (_, column) => {
      const width = Array.isArray(widths) ? widths[column] : null;

      return typeof width === 'number' && width > 0 ? width : null;
    }),
  };
}

/**
 * Приводит таблицу из чужого источника к прямоугольной: оставляет только строки и ячейки, дополняет короткие
 * строки, у ячеек убирает потомков. `null` — таблицы нет (нет строк или ячеек) или она больше пределов.
 */
export function normalizeTable(table: FragmentBlock): FragmentBlock | null {
  const rows = table.children.filter(isRow).map((row) => row.children.filter(isCell));
  const columns = Math.max(0, ...rows.map((row) => row.length));

  if (rows.length === 0 || columns === 0) return null;
  if (columns > MAX_TABLE_COLUMNS || rows.length * columns > MAX_TABLE_CELLS) return null;

  return {
    ...table,
    children: rows.map((cells) =>
      block(
        TABLE_ROW,
        {},
        [],
        Array.from({ length: columns }, (_, column) =>
          cells[column] ? { ...cells[column], children: [] } : block(TABLE_CELL, {}, [], []),
        ),
      ),
    ),
  };
}

const paragraph = (content: InlineNode[], props: Record<string, unknown> = {}) =>
  block('block:paragraph', props, content, []);

/** Строка таблицы одним абзацем: ячейки через табуляцию. Строка без ячеек — ничего. */
function rowParagraph(row: FragmentBlock): FragmentBlock[] {
  const cells = row.children.filter(isCell);

  if (cells.length === 0) return [];

  const content = cells.flatMap((cell, index) => [
    ...(index > 0 ? [{ insert: '\t' }] : []),
    ...cell.content,
  ]);

  return [paragraph(content)];
}

/** Ячейка вне таблицы — абзац с её текстом. */
function cellParagraph(cell: FragmentBlock): FragmentBlock {
  const align = cell.props.align;

  return paragraph(cell.content, isAlignment(align) ? { alignment: align } : {});
}

/**
 * Таблица как текст: каждая строка — абзац, ячейки через табуляцию. Так таблица вставляется туда, где таблиц нет
 * (редактор без `tableBlocks`) или она не подходит (слишком большая).
 */
export function tableToParagraphs(table: FragmentBlock): FragmentBlock[] {
  return table.children.filter(isRow).flatMap(rowParagraph);
}

/**
 * Приводит все таблицы во фрагменте в порядок: корректные остаются таблицами, слишком большие и повреждённые
 * превращаются в абзацы (текст не теряется), строки и ячейки вне таблицы — тоже в абзацы.
 */
export function repairTables(blocks: readonly FragmentBlock[]): FragmentBlock[] {
  return blocks.flatMap((item): FragmentBlock[] => {
    if (item.flavour === TABLE) {
      const normalized = normalizeTable(item);

      return normalized ? [normalized] : tableToParagraphs(item);
    }

    if (isRow(item)) return rowParagraph(item);
    if (isCell(item)) return [cellParagraph(item)];

    return [{ ...item, children: repairTables(item.children) }];
  });
}

/** Редактор без таблиц: таблицы фрагмента превращаются в абзацы (см. `tableToParagraphs`). */
export function degradeTables(blocks: readonly FragmentBlock[]): FragmentBlock[] {
  return blocks.flatMap((item): FragmentBlock[] => {
    if (item.flavour === TABLE) return tableToParagraphs(item);
    if (isRow(item)) return rowParagraph(item);
    if (isCell(item)) return [cellParagraph(item)];

    return [{ ...item, children: degradeTables(item.children) }];
  });
}
