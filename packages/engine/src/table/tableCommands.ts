import { TABLE_COLUMN_TYPES, type TableColumnType, type TableProps } from '@inkbrick/document';

import { defineBlockCommand, type BlockCommandContext } from '../controller/BlockController';
import type { CaretResult } from '../dispatcher/Intents';
import { addTableColumn, addTableRow, shiftedLists } from './tableOps';
import { sortKey, sortedOrder } from './tableSort';

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

  execute({ engine, transaction, block }, { index }): CaretResult {
    engine.block.remove(transaction, block.children[index]);

    const rows = transaction.getBlock(block.id)!.children;
    const row = transaction.getBlock(rows[Math.min(index, rows.length - 1)])!;

    return { blockId: row.children[0], offset: 0 };
  },
});

export const MoveTableRowCommand = defineBlockCommand<TableProps, { from: number; to: number }>({
  type: 'moveTableRow',

  canExecute: (context, { from, to }) =>
    from !== to && isIndex(from, rowsOf(context) - 1) && isIndex(to, rowsOf(context) - 1),

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
    from !== to && isIndex(from, columnsOf(context) - 1) && isIndex(to, columnsOf(context) - 1),

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

/** Задаёт тип столбца (`text`, `number`, `date`): от него зависит сортировка. */
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

    return sortPlan(context, column, direction).order.some((from, to) => from !== to);
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

export const tableCommands = [
  InsertTableRowCommand,
  DeleteTableRowCommand,
  MoveTableRowCommand,
  InsertTableColumnCommand,
  DeleteTableColumnCommand,
  MoveTableColumnCommand,
  SetTableColumnWidthCommand,
  SetTableColumnTypeCommand,
  SortTableRowsCommand,
] as const;
