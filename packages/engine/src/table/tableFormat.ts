import {
  alignProps,
  isAlignment,
  isBlockBackground,
  isColorName,
  safeCssColor,
  type Alignment,
  type BlockBackground,
  type BlockId,
  type TableProps,
  type TextAttributes,
} from '@inkbrick/document';

import { defineBlockCommand, type BlockCommandContext } from '../controller/BlockController';
import { clampTableRange, tableRangeCells, type TableRange } from './tableRange';

type Context = BlockCommandContext<TableProps>;

/** Форматы текста, которые переключаются на всём тексте ячеек. */
export const TABLE_TEXT_FORMATS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;

export type TableTextFormat = (typeof TABLE_TEXT_FORMATS)[number];

/** Что снимает «Очистить форматирование»: стили текста и цвета; ссылки, формулы и сноски остаются. */
const CLEARED: Partial<TextAttributes> = {
  bold: undefined,
  italic: undefined,
  underline: undefined,
  strike: undefined,
  code: undefined,
  color: undefined,
  backgroundColor: undefined,
};

const isRange = (range: unknown): range is TableRange =>
  typeof range === 'object' &&
  range !== null &&
  ['top', 'left', 'bottom', 'right'].every((key) => Number.isInteger((range as never)[key]));

/** Id ячеек прямоугольника (обрезанного по таблице) одним списком; пустой, если прямоугольник вне таблицы. */
function cellsOf(context: Context, range: TableRange): BlockId[] {
  if (!isRange(range)) return [];

  const getBlock = (id: BlockId) => context.transaction.getBlock(id);
  const clamped = clampTableRange(getBlock, context.block.id, range);

  return clamped ? [...new Set(tableRangeCells(getBlock, context.block.id, clamped).flat())] : [];
}

/** Ячейки с текстом: форматировать текст пустой ячейки нечем. */
function filledCells(context: Context, range: TableRange): BlockId[] {
  return cellsOf(context, range).filter(
    (id) => context.engine.inline.length(context.transaction.getBlock(id)?.content ?? []) > 0,
  );
}

function formatCells(
  context: Context,
  ids: readonly BlockId[],
  attributes: Partial<TextAttributes>,
) {
  const { engine, transaction } = context;

  for (const id of ids) {
    const content = transaction.getBlock(id)!.content;

    engine.block.updateContent(
      transaction,
      id,
      engine.inline.format(content, 0, engine.inline.length(content), attributes),
    );
  }
}

/**
 * Переключает формат текста (`bold`, `italic`, `underline`, `strike`, `code`) во всех ячейках прямоугольника: если он уже
 * включён у всего текста, снимает, иначе включает у всего. Пустые ячейки пропускаются. Один шаг undo.
 */
export const FormatTableCellsCommand = defineBlockCommand<
  TableProps,
  { range: TableRange; format: TableTextFormat }
>({
  type: 'formatTableCells',

  canExecute: (context, { range, format }) =>
    TABLE_TEXT_FORMATS.includes(format) && filledCells(context, range).length > 0,

  execute(context, { range, format }) {
    const { engine, transaction } = context;
    const ids = filledCells(context, range);
    const enabled = ids.every((id) => {
      const content = transaction.getBlock(id)!.content;

      return engine.inline.hasFormat(content, 0, engine.inline.length(content), format);
    });

    formatCells(context, ids, { [format]: enabled ? undefined : true });
  },
});

/**
 * Цвет текста и подсветка всему тексту ячеек: `attributes` — `color` и (или) `backgroundColor` (имя палитры или
 * безопасный CSS-цвет; `undefined` снимает цвет).
 */
export const SetTableCellsColorCommand = defineBlockCommand<
  TableProps,
  { range: TableRange; attributes: { color?: string; backgroundColor?: string } }
>({
  type: 'setTableCellsColor',

  canExecute(context, { range, attributes }) {
    if (typeof attributes !== 'object' || attributes === null) return false;

    const keys = Object.keys(attributes);

    if (keys.length === 0 || keys.some((key) => key !== 'color' && key !== 'backgroundColor'))
      return false;

    for (const key of keys) {
      const value = attributes[key as 'color'];

      if (value !== undefined && !isColorName(value) && safeCssColor(value) === null) return false;
    }

    return filledCells(context, range).length > 0;
  },

  execute(context, { range, attributes }) {
    formatCells(context, filledCells(context, range), attributes);
  },
});

/** Очищает форматирование текста ячеек: начертание, цвет и подсветку. Ссылки, формулы и сноски остаются. */
export const ClearTableCellsFormatCommand = defineBlockCommand<TableProps, { range: TableRange }>({
  type: 'clearTableCellsFormat',

  canExecute: (context, { range }) => filledCells(context, range).length > 0,

  execute(context, { range }) {
    formatCells(context, filledCells(context, range), CLEARED);
  },
});

/** Выравнивание текста всех ячеек прямоугольника по горизонтали. Один шаг undo. */
export const AlignTableCellsCommand = defineBlockCommand<
  TableProps,
  { range: TableRange; align: Alignment }
>({
  type: 'alignTableCells',

  canExecute: (context, { range, align }) =>
    isAlignment(align) && cellsOf(context, range).length > 0,

  execute(context, { range, align }) {
    for (const id of cellsOf(context, range)) {
      context.engine.block.update(context.transaction, id, (cell) => ({
        ...cell,
        props: { ...cell.props, ...alignProps(cell.flavour, align) },
      }));
    }
  },
});

/** Фон ячеек прямоугольника (цвет из `BLOCK_BACKGROUNDS`); `null` снимает фон. */
export const SetTableCellsBackgroundCommand = defineBlockCommand<
  TableProps,
  { range: TableRange; background: BlockBackground | null }
>({
  type: 'setTableCellsBackground',

  canExecute: (context, { range, background }) =>
    (background === null || isBlockBackground(background)) && cellsOf(context, range).length > 0,

  execute(context, { range, background }) {
    for (const id of cellsOf(context, range)) {
      context.engine.block.update(context.transaction, id, (cell) => {
        const { background: _previous, ...rest } = cell.props;

        return { ...cell, props: background === null ? rest : { ...rest, background } };
      });
    }
  },
});

/** Возвращает ширины столбцов «по содержимому»: заданные вручную ширины убираются. */
export const ResetTableColumnWidthsCommand = defineBlockCommand<TableProps, object>({
  type: 'resetTableColumnWidths',

  canExecute: ({ block }) => !!block.props.widths?.some((width) => width !== null),

  execute(context) {
    context.setProps({ widths: undefined });
  },
});

export const tableFormatCommands = [
  FormatTableCellsCommand,
  SetTableCellsColorCommand,
  ClearTableCellsFormatCommand,
  AlignTableCellsCommand,
  SetTableCellsBackgroundCommand,
  ResetTableColumnWidthsCommand,
] as const;
