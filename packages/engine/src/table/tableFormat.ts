import {
  alignProps,
  isAlignment,
  isBlockBackground,
  isColorName,
  isHexColor,
  safeCssColor,
  TABLE_BORDER_SIDES,
  TABLE_BORDER_STYLES,
  TABLE_BORDER_WIDTHS,
  type Alignment,
  type BlockBackground,
  type BlockId,
  type ColorName,
  type TableBorderSide,
  type TableBorderStyle,
  type TableBorderWidth,
  type TableProps,
  type TextAttributes,
} from '@inkbrick/document';

import { defineBlockCommand, type BlockCommandContext } from '../controller/BlockController';
import { tableSize } from './tableGrid';
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

/** Фон ячеек прямоугольника (цвет из `BLOCK_BACKGROUNDS` или свой `#rrggbb`); `null` снимает фон. */
export const SetTableCellsBackgroundCommand = defineBlockCommand<
  TableProps,
  { range: TableRange; background: BlockBackground | string | null }
>({
  type: 'setTableCellsBackground',

  canExecute: (context, { range, background }) =>
    (background === null || isBlockBackground(background) || isHexColor(background)) &&
    cellsOf(context, range).length > 0,

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

/** Какие линии меняет пункт меню границ (как в офисных редакторах). */
export const TABLE_BORDER_MODES = [
  'all',
  'outside',
  'inside',
  'insideHorizontal',
  'insideVertical',
  'top',
  'bottom',
  'left',
  'right',
  'none',
] as const;

/**
 * Режимы `setTableCellsBorders`: линии из `TABLE_BORDER_MODES` или `keep` — не добавлять и не убирать линии, а только
 * сменить толщину, цвет и начертание тех, что уже есть у ячеек прямоугольника.
 */
export type TableBorderMode = (typeof TABLE_BORDER_MODES)[number] | 'keep';

const FACING: Readonly<Record<TableBorderSide, TableBorderSide>> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

const SIDE_PROP: Readonly<Record<TableBorderSide, string>> = {
  top: 'borderTop',
  right: 'borderRight',
  bottom: 'borderBottom',
  left: 'borderLeft',
};

/**
 * Границы ячеек прямоугольника. `mode` выбирает линии: все, внешние, внутренние (горизонтальные и вертикальные вместе
 * или по отдельности), одну из четырёх внешних сторон или «без границ» (убирает и линии на краю прямоугольника). Линия
 * между двумя ячейками записывается в обе, поэтому соседняя ячейка вне прямоугольника не перебивает её. `width` —
 * толщина (для `none` не нужна), `color` — цвет из палитры, `style` — начертание (одно на все стороны ячейки); что не
 * передано, остаётся прежним. Режим `keep` меняет только оформление уже существующих линий (`width`, `color`, `style`;
 * нужен хотя бы один из них): сторона без значения считается линией, если у таблицы включены границы.
 */
export const SetTableCellsBordersCommand = defineBlockCommand<
  TableProps,
  {
    range: TableRange;
    mode: TableBorderMode;
    width?: TableBorderWidth;
    color?: ColorName | null;
    style?: TableBorderStyle;
  }
>({
  type: 'setTableCellsBorders',

  canExecute(context, { range, mode, width, color, style }) {
    if (mode !== 'keep' && !TABLE_BORDER_MODES.includes(mode)) return false;
    if (width !== undefined && !TABLE_BORDER_WIDTHS.includes(width)) return false;
    if (color !== undefined && color !== null && !isColorName(color)) return false;
    if (style !== undefined && !TABLE_BORDER_STYLES.includes(style)) return false;

    if (mode === 'keep') {
      if (width === 'none' || (width === undefined && color === undefined && style === undefined))
        return false;
    } else if (mode !== 'none' && (!width || width === 'none')) return false;

    return cellsOf(context, range).length > 0;
  },

  execute(context, { range, mode, width, color, style }) {
    const getBlock = (id: BlockId) => context.transaction.getBlock(id);
    const size = tableSize(getBlock, context.block.id);
    const clamped = clampTableRange(getBlock, context.block.id, range);

    if (!size || !clamped) return;

    const full = tableRangeCells(getBlock, context.block.id, {
      top: 0,
      left: 0,
      bottom: size.rows - 1,
      right: size.columns - 1,
    });
    const fallback: TableBorderWidth = context.block.props.borders === false ? 'none' : 'thin';
    const touched = new Set<BlockId>();

    const put = (row: number, column: number, side: TableBorderSide, value: TableBorderWidth) => {
      const id = full[row]?.[column];

      if (!id) return;

      touched.add(id);
      context.engine.block.update(context.transaction, id, (cell) => ({
        ...cell,
        props: { ...cell.props, [SIDE_PROP[side]]: value },
      }));
    };
    // Ячейка по другую сторону линии.
    const near = (row: number, column: number, side: TableBorderSide) =>
      [
        row + (side === 'top' ? -1 : side === 'bottom' ? 1 : 0),
        column + (side === 'left' ? -1 : side === 'right' ? 1 : 0),
      ] as const;
    // Линия записывается и в ячейку, и в соседа с другой стороны (если он есть).
    const line = (row: number, column: number, side: TableBorderSide, value: TableBorderWidth) => {
      put(row, column, side, value);
      put(...near(row, column, side), FACING[side], value);
    };
    const value: TableBorderWidth = mode === 'none' ? 'none' : (width ?? 'thin');

    for (let row = clamped.top; row <= clamped.bottom; row++) {
      for (let column = clamped.left; column <= clamped.right; column++) {
        if (mode === 'keep') {
          for (const side of TABLE_BORDER_SIDES) {
            const current = (getBlock(full[row]?.[column] ?? '')?.props[SIDE_PROP[side]] ??
              fallback) as TableBorderWidth;

            if (current === 'none') continue;

            if (width !== undefined) {
              line(row, column, side, width);
              continue;
            }

            // Меняются только цвет или начертание: толщины не трогаем ни у ячейки, ни у соседа (иначе своя «тонкая» по
            // умолчанию затёрла бы толстую линию соседа), но общая линия перекрашивается у обоих.
            const [nearRow, nearColumn] = near(row, column, side);

            for (const id of [full[row]?.[column], full[nearRow]?.[nearColumn]])
              if (id) touched.add(id);
          }

          continue;
        }

        const first = row === clamped.top;
        const last = row === clamped.bottom;
        const left = column === clamped.left;
        const right = column === clamped.right;
        const all = mode === 'all' || mode === 'none';

        if (all || mode === 'outside' || mode === 'top')
          if (all || first) line(row, column, 'top', value);
        if (all || mode === 'outside' || mode === 'bottom')
          if (all || last) line(row, column, 'bottom', value);
        if (all || mode === 'outside' || mode === 'left')
          if (all || left) line(row, column, 'left', value);
        if (all || mode === 'outside' || mode === 'right')
          if (all || right) line(row, column, 'right', value);
        if ((mode === 'inside' || mode === 'insideHorizontal') && !first)
          line(row, column, 'top', value);
        if ((mode === 'inside' || mode === 'insideVertical') && !left)
          line(row, column, 'left', value);
      }
    }

    for (const id of touched) {
      context.engine.block.update(context.transaction, id, (cell) => {
        const { borderColor: _color, borderStyle: _style, ...rest } = cell.props;
        const next: Record<string, unknown> = { ...rest };

        if (color === undefined) {
          if (_color !== undefined) next.borderColor = _color;
        } else if (color !== null) next.borderColor = color;

        if (style === undefined) {
          if (_style !== undefined) next.borderStyle = _style;
        } else if (style !== 'solid') next.borderStyle = style;

        return { ...cell, props: next as typeof cell.props };
      });
    }
  },
});

export const tableFormatCommands = [
  FormatTableCellsCommand,
  SetTableCellsColorCommand,
  ClearTableCellsFormatCommand,
  AlignTableCellsCommand,
  SetTableCellsBackgroundCommand,
  SetTableCellsBordersCommand,
  ResetTableColumnWidthsCommand,
] as const;
