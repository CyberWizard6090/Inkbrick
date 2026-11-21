import * as z from '../zod';

import type { BaseBlock } from '../../model/BaseBlock';
import type { BlockSchema, BlockTemplate } from '../BlockSchema';
import { COLOR_NAMES } from '../../utils/colors';
import { blockBackgroundSchema } from './blockBackground';

export const TABLE = 'block:table';
export const TABLE_ROW = 'block:table-row';
export const TABLE_CELL = 'block:table-cell';

/** Размер таблицы, которую создаёт пользователь (slash-меню, `insertBlock`). */
export const TABLE_DEFAULT_ROWS = 3;
export const TABLE_DEFAULT_COLUMNS = 3;

/** Тип столбца: от него зависит сортировка (число и дата сравниваются как число и дата, а не как текст). */
export const TABLE_COLUMN_TYPES = ['text', 'number', 'date'] as const;

export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

/**
 * Готовые оформления таблицы (цвет заголовка, чередования и линий): `plain` — без оформления, `grid` — сетка,
 * `lines` — только горизонтальные линии, остальные красят заголовок и линии в свой цвет.
 */
export const TABLE_STYLES = [
  'plain',
  'grid',
  'lines',
  'blue',
  'green',
  'orange',
  'purple',
  'dark',
] as const;

export type TableStyle = (typeof TABLE_STYLES)[number];

/** Толщина границы ячейки с одной стороны: `none` — без линии. */
export const TABLE_BORDER_WIDTHS = ['none', 'thin', 'medium', 'thick'] as const;

export type TableBorderWidth = (typeof TABLE_BORDER_WIDTHS)[number];

/** Начертание линий границы ячейки: сплошная, прерывистая, точками. */
export const TABLE_BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const;

export type TableBorderStyle = (typeof TABLE_BORDER_STYLES)[number];

/** Стороны ячейки, у которых можно задать границу. */
export const TABLE_BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;

export type TableBorderSide = (typeof TABLE_BORDER_SIDES)[number];

/** Объединённые ячейки: прямоугольник `rows` × `columns` с началом в `row`, `column` (с нуля); текст хранит верхняя левая. */
export const tableMergeSchema = z.object({
  row: z.number().int().min(0),
  column: z.number().int().min(0),
  rows: z.number().int().min(1),
  columns: z.number().int().min(1),
});

export type TableMerge = z.infer<typeof tableMergeSchema>;

export const tablePropsSchema = z.object({
  /** Первая строка — заголовок. */
  header: z.boolean().default(true),
  /** Первый столбец — заголовок (выделяется как заголовок строки; в HTML — `<th scope="row">`). */
  headerColumn: z.boolean().default(false),
  /** Чередующиеся строки: каждая вторая строка тела таблицы чуть темнее. */
  striped: z.boolean().default(false),
  /** Границы ячеек; `false` — таблица без линий. */
  borders: z.boolean().default(true),
  /** Готовое оформление (`TABLE_STYLES`); без него таблица выглядит по умолчанию. */
  tableStyle: z.enum(TABLE_STYLES).optional(),
  /** Первая строка остаётся на виду при прокрутке таблицы. */
  freezeRow: z.boolean().default(false),
  /** Первый столбец остаётся на виду при горизонтальной прокрутке. */
  freezeColumn: z.boolean().default(false),
  /**
   * Ширины столбцов в пикселях по порядку; `null` или отсутствующий элемент — ширина по содержимому.
   * Длина может не совпадать с числом столбцов: лишнее игнорируется.
   */
  widths: z.array(z.number().positive().nullable()).optional(),
  /** Типы столбцов по порядку; недостающие элементы — `text`. */
  columnTypes: z.array(z.enum(TABLE_COLUMN_TYPES)).optional(),
  /** Объединённые ячейки. Сетка остаётся прямоугольной: перекрытые ячейки есть в документе, но пусты и не показываются. */
  merges: z.array(tableMergeSchema).optional(),
});

export type TableProps = z.infer<typeof tablePropsSchema>;

export const tableRowPropsSchema = z.object({});

const borderWidth = z.enum(TABLE_BORDER_WIDTHS).optional();
const borderColor = z.enum(COLOR_NAMES).optional();
const borderLine = z.enum(TABLE_BORDER_STYLES).optional();

export const tableCellPropsSchema = z.object({
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  /** Фон ячейки: имя из `BLOCK_BACKGROUNDS` или свой цвет `#rrggbb`; без него фона нет. */
  background: blockBackgroundSchema.optional(),
  /** Границы ячейки по сторонам (`TABLE_BORDER_WIDTHS`); сторона без значения рисуется по оформлению таблицы. */
  borderTop: borderWidth,
  borderRight: borderWidth,
  borderBottom: borderWidth,
  borderLeft: borderWidth,
  /** Цвет линий границы: имя из палитры цветов текста; без него — обычный цвет линий. */
  borderColor: borderColor,
  /** Начертание линий границы (`TABLE_BORDER_STYLES`); без него — сплошная. Одно на все стороны ячейки. */
  borderStyle: borderLine,
  /**
   * Цвет и начертание отдельной стороны: перекрывают `borderColor` и `borderStyle` для неё. Так общая линия двух ячеек
   * красится у обеих, а остальные стороны соседа остаются прежними.
   */
  borderTopColor: borderColor,
  borderRightColor: borderColor,
  borderBottomColor: borderColor,
  borderLeftColor: borderColor,
  borderTopStyle: borderLine,
  borderRightStyle: borderLine,
  borderBottomStyle: borderLine,
  borderLeftStyle: borderLine,
});

/** Заготовка таблицы `rows` × `columns` с пустыми ячейками. */
export function tableTemplate(rows: number, columns: number): BlockTemplate[] {
  return Array.from({ length: Math.max(1, rows) }, () => ({
    flavour: TABLE_ROW,
    children: Array.from({ length: Math.max(1, columns) }, () => ({ flavour: TABLE_CELL })),
  }));
}

/**
 * Таблица: `block:table` → строки `block:table-row` → ячейки `block:table-cell` (текстовые блоки).
 * В таблице есть хотя бы одна строка, во всех строках поровну ячеек (хотя бы одна).
 */
export const TableSchema: BlockSchema<typeof tablePropsSchema> = {
  flavour: TABLE,
  name: 'Table',
  icon: 'table',

  allowedParents: ['role:hub'],
  allowedChildren: [TABLE_ROW],
  inline: false,

  scaffold: () => tableTemplate(TABLE_DEFAULT_ROWS, TABLE_DEFAULT_COLUMNS),

  validate(block, getBlock) {
    const rows = block.children.map((id) => getBlock(id)).filter((row): row is BaseBlock => !!row);

    if (rows.length === 0) return [`table "${block.id}" has no rows`];

    const width = rows[0].children.length;
    const issues: string[] = [];

    if (width === 0) issues.push(`table "${block.id}" has a row without cells`);

    for (const row of rows) {
      if (row.children.length !== width)
        issues.push(
          `table "${block.id}": row "${row.id}" has ${row.children.length} cells, expected ${width}`,
        );
    }

    return issues;
  },

  repair(block, tree) {
    const fixes: string[] = [];

    if (block.children.length === 0) {
      tree.append(block.id, TABLE_ROW);
      fixes.push(`table "${block.id}": added a missing row`);
    }

    const rows = tree.get(block.id)!.children.map((id) => tree.get(id)!);
    const width = Math.max(1, ...rows.map((row) => row.children.length));

    for (const row of rows) {
      const missing = width - row.children.length;

      for (let i = 0; i < missing; i++) tree.append(row.id, TABLE_CELL);
      if (missing > 0)
        fixes.push(`table "${block.id}": row "${row.id}" padded with ${missing} cells`);
    }

    return fixes;
  },

  commands: [],
  shortcuts: [],
  rendererHint: 'table-block',

  propsSchema: tablePropsSchema,
};

export const TableRowSchema: BlockSchema<typeof tableRowPropsSchema> = {
  flavour: TABLE_ROW,
  name: 'Table row',
  icon: 'table',

  allowedParents: [TABLE],
  allowedChildren: [TABLE_CELL],
  inline: false,
  isolating: true,

  commands: [],
  shortcuts: [],
  rendererHint: 'table-row',

  propsSchema: tableRowPropsSchema,
};

export const TableCellSchema: BlockSchema<typeof tableCellPropsSchema> = {
  flavour: TABLE_CELL,
  name: 'Table cell',
  icon: 'table',

  allowedParents: [TABLE_ROW],
  allowedChildren: [],
  isolating: true,
  enter: { mode: 'newline' },

  commands: [],
  shortcuts: [],
  rendererHint: 'table-cell',

  propsSchema: tableCellPropsSchema,
};

/**
 * Схемы таблицы. Во встроенный набор не входят: подключаются явно, вместе с командами —
 * `new Editor({ blocks: tableBlocks })` из `@inkbrick/engine`.
 */
export const tableBlockSchemas: readonly BlockSchema[] = [
  TableSchema,
  TableRowSchema,
  TableCellSchema,
];
