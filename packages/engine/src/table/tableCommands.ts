import { TABLE_CELL, TABLE_ROW, type TableProps } from '@inkbrick/document';

import { defineBlockCommand, type BlockCommandContext } from '../controller/BlockController';
import type { CaretResult } from '../dispatcher/Intents';

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
function updateWidths(context: Context, change: (widths: (number | null)[]) => void): void {
  const { widths } = context.block.props;

  if (!widths) return;

  // Список может быть короче числа столбцов — дополняем, чтобы индексы совпали со столбцами.
  const next = Array.from({ length: columnsOf(context) }, (_, i) => widths[i] ?? null);

  change(next);
  context.setProps({ widths: next });
}

/**
 * Вставляет пустую строку на место `index` (0 — первой, число строк — последней).
 * Возвращает позицию курсора в её первой ячейке.
 */
export const InsertTableRowCommand = defineBlockCommand<TableProps, { index: number }>({
  type: 'insertTableRow',

  canExecute: (context, { index }) => isIndex(index, rowsOf(context)),

  execute(context, { index }): CaretResult {
    const { engine, transaction, block } = context;
    const columns = Math.max(1, columnsOf(context));
    const row = engine.block.create({ flavour: TABLE_ROW, parentId: block.id });

    engine.block.insert(transaction, block.id, index, row);

    const [first] = engine.block.build(
      transaction,
      row.id,
      Array.from({ length: columns }, () => ({ flavour: TABLE_CELL })),
    );

    return { blockId: first, offset: 0 };
  },
});

/** Удаляет строку вместе с текстом ячеек. Последнюю строку удалить нельзя — удаляйте таблицу. */
export const DeleteTableRowCommand = defineBlockCommand<TableProps, { index: number }>({
  type: 'deleteTableRow',

  canExecute: (context, { index }) => rowsOf(context) > 1 && isIndex(index, rowsOf(context) - 1),

  execute({ engine, transaction, block }, { index }): CaretResult {
    engine.block.remove(transaction, block.children[index]);

    // Курсор — в ту же по счёту строку (или в последнюю), в первую ячейку.
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

  execute(context, { index }): CaretResult {
    const { engine, transaction, block } = context;

    updateWidths(context, (widths) => widths.splice(index, 0, null));

    const cells = block.children.map((rowId) => {
      const cell = engine.block.create({ flavour: TABLE_CELL, parentId: rowId });

      engine.block.insert(transaction, rowId, index, cell);

      return cell.id;
    });

    return { blockId: cells[0], offset: 0 };
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

export const tableCommands = [
  InsertTableRowCommand,
  DeleteTableRowCommand,
  MoveTableRowCommand,
  InsertTableColumnCommand,
  DeleteTableColumnCommand,
  MoveTableColumnCommand,
  SetTableColumnWidthCommand,
] as const;
