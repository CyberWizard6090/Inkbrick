import {
  TABLE_COLUMN_TYPES,
  TABLE_FILTER_OPS,
  TABLE_OPTION_COLORS,
  type TableColumnType,
  type TableFilter,
  type TableOption,
  type TableView,
  type TableProps,
} from '@inkbrick/document';

import { defineBlockCommand, type BlockCommandContext } from '../controller/BlockController';
import type { CaretResult } from '../dispatcher/Intents';
import { addTableColumn, addTableRow, shiftedLists } from './tableOps';
import { sortKey, sortedOrder } from './tableSort';
import {
  expandRangeToMerges,
  mergesAfterDelete,
  normalizeMerges,
  type TableAxis,
} from './tableMerge';
import { clampTableRange, type TableRange } from './tableRange';
import { tableFormatCommands } from './tableFormat';

type Context = BlockCommandContext<TableProps>;

const isIndex = (value: unknown, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

const rowsOf = ({ block }: Context) => block.children.length;

const columnsOf = ({ block, transaction }: Context) =>
  transaction.getBlock(block.children[0] ?? '')?.children.length ?? 0;

/**
 * Меняет список ширин вместе со столбцами; пока ширины не заданы, список не появляется.
 * Вызывается до правки ячеек: индексы списка — столбцы, какими они были.
 */
function updateWidths(context: Context, change: (list: unknown[]) => void): void {
  const lists = shiftedLists(context.block.props, columnsOf(context), (list) => change(list));

  if (lists) context.setProps(lists as Partial<TableProps>);
}

const mergesOf = (context: Context) =>
  normalizeMerges(context.block.props.merges, rowsOf(context), columnsOf(context));

/** Таблица с объединёнными ячейками: строки и столбцы нельзя переносить и сортировать — объединения разошлись бы. */
const hasMerges = (context: Context) => mergesOf(context).length > 0;

/** После удаления строки или столбца объединения сжимаются; список без объединений не появляется. */
function shrinkMerges(context: Context, axis: TableAxis, index: number): void {
  const merges = mergesOf(context);

  if (merges.length === 0) return;

  const next = mergesAfterDelete(merges, axis, index);

  context.setProps({ merges: next.length > 0 ? next : undefined });
}

/**
 * Вставляет пустую строку на место `index` (0 — первой, число строк — последней).
 * Возвращает позицию курсора в её первой ячейке.
 */
export const InsertTableRowCommand = defineBlockCommand<TableProps, { index: number }>({
  type: 'insertTableRow',

  canExecute: (context, { index }) => isIndex(index, rowsOf(context)),

  execute({ engine, transaction, block }, { index }): CaretResult {
    const [first] = addTableRow(engine, transaction, block.id, index);

    return { blockId: first, offset: 0 };
  },
});

/** Удаляет строку вместе с текстом ячеек. Последнюю строку удалить нельзя — удаляйте таблицу. */
export const DeleteTableRowCommand = defineBlockCommand<TableProps, { index: number }>({
  type: 'deleteTableRow',

  canExecute: (context, { index }) => rowsOf(context) > 1 && isIndex(index, rowsOf(context) - 1),

  execute(context, { index }): CaretResult {
    const { engine, transaction, block } = context;

    shrinkMerges(context, 'row', index);
    engine.block.remove(transaction, block.children[index]);

    const rows = transaction.getBlock(block.id)!.children;
    const row = transaction.getBlock(rows[Math.min(index, rows.length - 1)])!;

    return { blockId: row.children[0], offset: 0 };
  },
});

export const MoveTableRowCommand = defineBlockCommand<TableProps, { from: number; to: number }>({
  type: 'moveTableRow',

  canExecute: (context, { from, to }) =>
    from !== to &&
    isIndex(from, rowsOf(context) - 1) &&
    isIndex(to, rowsOf(context) - 1) &&
    !hasMerges(context),

  execute({ engine, transaction, block }, { from, to }) {
    engine.block.move(transaction, block.children[from], block.id, to);
  },
});

/**
 * Вставляет пустой столбец на место `index` (0 — первым, число столбцов — последним).
 * Возвращает позицию курсора в его верхней ячейке.
 */
export const InsertTableColumnCommand = defineBlockCommand<TableProps, { index: number }>({
  type: 'insertTableColumn',

  canExecute: (context, { index }) => isIndex(index, columnsOf(context)),

  execute({ engine, transaction, block }, { index }): CaretResult {
    const [first] = addTableColumn(engine, transaction, block.id, index);

    return { blockId: first, offset: 0 };
  },
});

/** Удаляет столбец вместе с текстом ячеек. Последний столбец удалить нельзя — удаляйте таблицу. */
export const DeleteTableColumnCommand = defineBlockCommand<TableProps, { index: number }>({
  type: 'deleteTableColumn',

  canExecute: (context, { index }) =>
    columnsOf(context) > 1 && isIndex(index, columnsOf(context) - 1),

  execute(context, { index }): CaretResult {
    const { engine, transaction, block } = context;

    shrinkMerges(context, 'column', index);
    updateWidths(context, (widths) => widths.splice(index, 1));

    for (const rowId of block.children) {
      engine.block.remove(transaction, transaction.getBlock(rowId)!.children[index]);
    }

    const first = transaction.getBlock(block.children[0])!;

    return { blockId: first.children[Math.min(index, first.children.length - 1)], offset: 0 };
  },
});

export const MoveTableColumnCommand = defineBlockCommand<TableProps, { from: number; to: number }>({
  type: 'moveTableColumn',

  canExecute: (context, { from, to }) =>
    from !== to &&
    isIndex(from, columnsOf(context) - 1) &&
    isIndex(to, columnsOf(context) - 1) &&
    !hasMerges(context),

  execute(context, { from, to }) {
    const { engine, transaction, block } = context;

    updateWidths(context, (widths) => widths.splice(to, 0, ...widths.splice(from, 1)));

    for (const rowId of block.children) {
      engine.block.move(transaction, transaction.getBlock(rowId)!.children[from], rowId, to);
    }
  },
});

/** Задаёт ширину столбца в пикселях; `null` — снова по содержимому. */
export const SetTableColumnWidthCommand = defineBlockCommand<
  TableProps,
  { index: number; width: number | null }
>({
  type: 'setTableColumnWidth',

  canExecute: (context, { index, width }) =>
    isIndex(index, columnsOf(context) - 1) &&
    (width === null || (typeof width === 'number' && Number.isFinite(width) && width > 0)),

  execute(context, { index, width }) {
    const widths = Array.from(
      { length: columnsOf(context) },
      (_, i) => context.block.props.widths?.[i] ?? null,
    );

    widths[index] = width;
    context.setProps({ widths: widths.some((value) => value !== null) ? widths : undefined });
  },
});

/** Задаёт тип столбца (`text`, `number`, `date`, `checkbox`, `select`, …): от него зависят сортировка и отображение. */
export const SetTableColumnTypeCommand = defineBlockCommand<
  TableProps,
  { index: number; type: TableColumnType }
>({
  type: 'setTableColumnType',

  canExecute: (context, { index, type }) =>
    isIndex(index, columnsOf(context) - 1) && TABLE_COLUMN_TYPES.includes(type),

  execute(context, { index, type }) {
    const types = Array.from(
      { length: columnsOf(context) },
      (_, i) => context.block.props.columnTypes?.[i] ?? 'text',
    );

    types[index] = type;
    context.setProps({ columnTypes: types.some((value) => value !== 'text') ? types : undefined });
  },
});

const MAX_OPTIONS = 100;

/** Варианты списка в порядке показа: непустые названия без повторов (регистр различается), цвет из набора. */
const validOptions = (options: unknown): options is TableOption[] =>
  Array.isArray(options) &&
  options.length <= MAX_OPTIONS &&
  options.every(
    (option) =>
      !!option &&
      typeof option.label === 'string' &&
      option.label.trim() !== '' &&
      option.label.length <= 100 &&
      !option.label.includes(',') &&
      (option.color === undefined || TABLE_OPTION_COLORS.includes(option.color)),
  ) &&
  new Set(options.map((option) => option.label)).size === options.length;

/**
 * Задаёт варианты списка столбца (`select`, `multiselect`); пустой список убирает их. Названия не содержат запятую:
 * ею разделены значения `multiselect` в ячейке. Уже записанные в ячейках значения не меняются.
 */
export const SetTableColumnOptionsCommand = defineBlockCommand<
  TableProps,
  { index: number; options: readonly TableOption[] }
>({
  type: 'setTableColumnOptions',

  canExecute: (context, { index, options }) =>
    isIndex(index, columnsOf(context) - 1) && validOptions(options),

  execute(context, { index, options }) {
    const lists = Array.from(
      { length: columnsOf(context) },
      (_, i) => context.block.props.columnOptions?.[i] ?? null,
    );

    lists[index] = options.length > 0 ? options.map((option) => ({ ...option })) : null;
    context.setProps({ columnOptions: lists.some((list) => list) ? lists : undefined });
  },
});

const MAX_VIEWS = 20;

const isFilter = (filter: unknown): boolean =>
  filter === null ||
  (!!filter &&
    TABLE_FILTER_OPS.includes((filter as TableFilter).op) &&
    ((filter as TableFilter).value === undefined ||
      (typeof (filter as TableFilter).value === 'string' &&
        ((filter as TableFilter).value as string).length <= 200)));

/** Настроен ли вид: скрытые столбцы, фильтры или сортировка. */
const customized = (view: TableView) =>
  !!view.hidden?.some(Boolean) || !!view.filters?.some(Boolean) || !!view.sort;

/**
 * Виды таблицы целиком: список заменяется одной правкой (один шаг undo), пустой список возвращает таблицу к одному виду
 * без настроек. Проверяется: уникальные коды, столбцы существуют, хотя бы один столбец виден, условия фильтров из
 * набора. Скрытие, фильтры и сортировка недоступны в таблице с объединёнными ячейками — сетка разошлась бы.
 */
export const SetTableViewsCommand = defineBlockCommand<TableProps, { views: readonly TableView[] }>(
  {
    type: 'setTableViews',

    canExecute: (context, { views }) => {
      if (!Array.isArray(views) || views.length > MAX_VIEWS) return false;

      const columns = columnsOf(context);
      const merged = hasMerges(context);

      return (
        new Set(views.map((view) => view?.id)).size === views.length &&
        views.every(
          (view) =>
            !!view &&
            typeof view.id === 'string' &&
            view.id !== '' &&
            view.id.length <= 64 &&
            (view.name === undefined ||
              (typeof view.name === 'string' && view.name.length <= 60)) &&
            (!merged || !customized(view)) &&
            (view.hidden === undefined ||
              (Array.isArray(view.hidden) &&
                view.hidden.length <= columns &&
                Array.from({ length: columns }).some((_, i) => !view.hidden![i]))) &&
            (view.filters === undefined ||
              (Array.isArray(view.filters) &&
                view.filters.length <= columns &&
                view.filters.every(isFilter))) &&
            (view.sort === undefined ||
              (isIndex(view.sort.column, columns - 1) &&
                (view.sort.direction === 'asc' || view.sort.direction === 'desc'))),
        )
      );
    },

    execute(context, { views }) {
      context.setProps({
        views: views.length > 0 ? views.map((view) => ({ ...view })) : undefined,
      });
    },
  },
);

/** Строки таблицы и их порядок после сортировки по столбцу; заголовок остаётся первым. */
function sortPlan(context: Context, column: number, direction: 'asc' | 'desc') {
  const { block, transaction } = context;
  const fixed = block.props.header === false ? 0 : 1;
  const type = block.props.columnTypes?.[column] ?? 'text';
  const rows = block.children.slice(fixed);
  const keys = rows.map((rowId) => {
    const cell = transaction.getBlock(transaction.getBlock(rowId)?.children[column] ?? '');

    return sortKey(context.engine.inline.toPlainText(cell?.content ?? []), type);
  });

  return { fixed, rows, order: sortedOrder(keys, direction) };
}

/**
 * Сортирует строки по столбцу по его типу: текст — по алфавиту с числами как числами, число и дата — по значению.
 * Пустые и неразобранные значения идут в конец, заголовок остаётся на месте. Один шаг undo.
 */
export const SortTableRowsCommand = defineBlockCommand<
  TableProps,
  { column: number; direction: 'asc' | 'desc' }
>({
  type: 'sortTableRows',

  canExecute(context, { column, direction }) {
    if (!isIndex(column, columnsOf(context) - 1) || (direction !== 'asc' && direction !== 'desc'))
      return false;

    return (
      !hasMerges(context) &&
      sortPlan(context, column, direction).order.some((from, to) => from !== to)
    );
  },

  execute(context, { column, direction }) {
    const { engine, transaction, block } = context;
    const { fixed, rows, order } = sortPlan(context, column, direction);

    order.forEach((from, to) => {
      if (transaction.getBlock(block.id)!.children[fixed + to] !== rows[from]) {
        engine.block.move(transaction, rows[from], block.id, fixed + to);
      }
    });
  },
});

/** Прямоугольник из payload, обрезанный по таблице и расширенный до целых объединений. */
function mergeTarget(context: Context, range: TableRange): TableRange | undefined {
  const clamped = clampTableRange(
    (id) => context.transaction.getBlock(id),
    context.block.id,
    range,
  );

  return clamped && expandRangeToMerges(clamped, mergesOf(context));
}

const isRange = (range: unknown): range is TableRange =>
  typeof range === 'object' &&
  range !== null &&
  ['top', 'left', 'bottom', 'right'].every((key) => Number.isInteger((range as never)[key]));

/**
 * Объединяет ячейки прямоугольника в одну: текст всех ячеек собирается в верхней левой через перевод строки,
 * остальные остаются в документе пустыми и не показываются. Прямоугольник расширяется до целых объединений;
 * одну ячейку объединить нельзя.
 */
export const MergeTableCellsCommand = defineBlockCommand<TableProps, { range: TableRange }>({
  type: 'mergeTableCells',

  canExecute(context, { range }) {
    if (!isRange(range)) return false;

    const target = mergeTarget(context, range);

    return !!target && (target.bottom > target.top || target.right > target.left);
  },

  execute(context, { range }): CaretResult {
    const { engine, transaction, block } = context;
    const target = mergeTarget(context, range)!;
    const cellId = (row: number, column: number) =>
      transaction.getBlock(block.children[row])!.children[column];
    const origin = cellId(target.top, target.left);
    let content = [...(transaction.getBlock(origin)?.content ?? [])];

    for (let row = target.top; row <= target.bottom; row++) {
      for (let column = target.left; column <= target.right; column++) {
        const id = cellId(row, column);

        if (id === origin) continue;

        const extra = transaction.getBlock(id)?.content ?? [];

        if (extra.length > 0) {
          content = [...content, ...(content.length > 0 ? [{ insert: '\n' }] : []), ...extra];
          engine.block.updateContent(transaction, id, []);
        }
      }
    }

    engine.block.updateContent(transaction, origin, content);

    const kept = mergesOf(context).filter(
      (merge) =>
        merge.row + merge.rows - 1 < target.top ||
        merge.row > target.bottom ||
        merge.column + merge.columns - 1 < target.left ||
        merge.column > target.right,
    );

    context.setProps({
      merges: [
        ...kept,
        {
          row: target.top,
          column: target.left,
          rows: target.bottom - target.top + 1,
          columns: target.right - target.left + 1,
        },
      ],
    });

    return { blockId: origin, offset: engine.inline.length(content) };
  },
});

/** Разделяет объединённую ячейку (`row` и `column` — любая из её ячеек): текст остаётся в верхней левой. */
export const SplitTableCellCommand = defineBlockCommand<
  TableProps,
  { row: number; column: number }
>({
  type: 'splitTableCell',

  canExecute: (context, { row, column }) =>
    isIndex(row, rowsOf(context) - 1) &&
    isIndex(column, columnsOf(context) - 1) &&
    mergesOf(context).some(
      (merge) =>
        row >= merge.row &&
        row < merge.row + merge.rows &&
        column >= merge.column &&
        column < merge.column + merge.columns,
    ),

  execute(context, { row, column }): CaretResult {
    const merges = mergesOf(context);
    const merge = merges.find(
      (item) =>
        row >= item.row &&
        row < item.row + item.rows &&
        column >= item.column &&
        column < item.column + item.columns,
    )!;
    const rest = merges.filter((item) => item !== merge);

    context.setProps({ merges: rest.length > 0 ? rest : undefined });

    return {
      blockId: context.transaction.getBlock(context.block.children[merge.row])!.children[
        merge.column
      ],
      offset: 0,
    };
  },
});

export const tableCommands = [
  ...tableFormatCommands,
  InsertTableRowCommand,
  DeleteTableRowCommand,
  MoveTableRowCommand,
  InsertTableColumnCommand,
  DeleteTableColumnCommand,
  MoveTableColumnCommand,
  SetTableColumnWidthCommand,
  SetTableColumnTypeCommand,
  SetTableColumnOptionsCommand,
  SetTableViewsCommand,
  SortTableRowsCommand,
  MergeTableCellsCommand,
  SplitTableCellCommand,
] as const;
