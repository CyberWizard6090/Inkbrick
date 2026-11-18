import * as z from '../zod';

import type { BaseBlock } from '../../model/BaseBlock';
import type { BlockSchema, BlockTemplate } from '../BlockSchema';
import { BLOCK_BACKGROUNDS } from '../../utils/colors';

export const TABLE = 'block:table';
export const TABLE_ROW = 'block:table-row';
export const TABLE_CELL = 'block:table-cell';

/** Размер таблицы, которую создаёт пользователь (slash-меню, `insertBlock`). */
export const TABLE_DEFAULT_ROWS = 3;
export const TABLE_DEFAULT_COLUMNS = 3;

/**
 * Тип столбца: от него зависят сортировка (число и дата сравниваются как число и дата, а не как текст), отображение и
 * ввод. Значение любого типа хранится текстом в ячейке: `checkbox` — `true` или пусто, `select` — название варианта,
 * `multiselect` — названия через запятую; `url`, `email`, `phone` — как написано.
 */
export const TABLE_COLUMN_TYPES = [
  'text',
  'number',
  'date',
  'checkbox',
  'select',
  'multiselect',
  'url',
  'email',
  'phone',
] as const;

export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

/** Цвета вариантов выбора (названия цветов текста редактора). */
export const TABLE_OPTION_COLORS = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
] as const;

export type TableOptionColor = (typeof TABLE_OPTION_COLORS)[number];

/** Вариант списка для столбцов `select` и `multiselect`. */
export const tableOptionSchema = z.object({
  label: z.string().min(1).max(100),
  color: z.enum(TABLE_OPTION_COLORS).optional(),
});

export type TableOption = z.infer<typeof tableOptionSchema>;

/**
 * Условие фильтра столбца. Для текста, выбора и ссылок сравнивается текст (без учёта регистра; у мультивыбора `equals`
 * ищет значение среди выбранных), для числа и даты — число и дата, для флажка — отметка.
 */
export const TABLE_FILTER_OPS = [
  'contains',
  'notContains',
  'equals',
  'notEquals',
  'gt',
  'lt',
  'empty',
  'notEmpty',
  'checked',
  'unchecked',
] as const;

export type TableFilterOp = (typeof TABLE_FILTER_OPS)[number];

export const tableFilterSchema = z.object({
  op: z.enum(TABLE_FILTER_OPS),
  /** Значение для сравнения; у `empty`, `notEmpty`, `checked`, `unchecked` не нужно. */
  value: z.string().max(200).optional(),
});

export type TableFilter = z.infer<typeof tableFilterSchema>;

/** Вид таблицы. Списки по столбцам идут по порядку столбцов; недостающие элементы — столбец виден, фильтра нет. */
export const tableViewSchema = z.object({
  /** Уникальный в таблице код вида. */
  id: z.string().min(1).max(64),
  /** Название; без него показывается стандартное («Таблица»). */
  name: z.string().max(60).optional(),
  /** Скрытые столбцы: ячейки не рисуются, данные остаются. Хотя бы один столбец остаётся видимым. */
  hidden: z.array(z.boolean()).optional(),
  /** Фильтры столбцов (`null` — без фильтра): строка видна, если подходит всем; заголовок не фильтруется. */
  filters: z.array(tableFilterSchema.nullable()).optional(),
  /** Порядок показа строк по столбцу; порядок строк в документе не меняется. */
  sort: z
    .object({ column: z.number().int().min(0), direction: z.enum(['asc', 'desc']) })
    .optional(),
});

export type TableView = z.infer<typeof tableViewSchema>;

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
  /** Варианты списка по столбцам (`select`, `multiselect`); `null` или отсутствующий элемент — вариантов нет. */
  columnOptions: z.array(z.array(tableOptionSchema).nullable()).optional(),
  /**
   * Виды таблицы: у каждого свои скрытые столбцы, фильтры и сортировка. Данные у всех видов одни; вид решает, что из них
   * показать. Нет списка — один вид без настроек. Какой вид открыт, хранится не в документе, а в окне (у каждого читателя
   * свой).
   */
  views: z.array(tableViewSchema).min(1).optional(),
  /** Объединённые ячейки. Сетка остаётся прямоугольной: перекрытые ячейки есть в документе, но пусты и не показываются. */
  merges: z.array(tableMergeSchema).optional(),
});

export type TableProps = z.infer<typeof tablePropsSchema>;

export const tableRowPropsSchema = z.object({});

export const tableCellPropsSchema = z.object({
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  /** Цвет фона ячейки (`BLOCK_BACKGROUNDS`); без него фона нет. */
  background: z.enum(BLOCK_BACKGROUNDS).optional(),
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
