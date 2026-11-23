import type { BaseBlock } from '../model';
import { exportColor, getBlockBackgroundColor, isHexColor } from '../utils/colors';
import { TABLE_CELL } from '../schema/blocks/TableSchema';

/*
 * Оформление блоков и ячеек таблицы в `style` для HTML вне редактора (экспорт документа, буфер обмена). Отдельный модуль:
 * буфер обмена берёт отсюда стиль ячейки, не затягивая в ядро весь экспорт.
 */

const ALIGNED = new Set(['center', 'right', 'justify']);

/** Фон ячейки таблицы: насыщенные цвета (как `--inkbrick-cell-*` в стилях), одинаковые в обеих темах. */
const CELL_HEX: Readonly<Record<string, string>> = {
  gray: '#9ca3af',
  brown: '#a16207',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  red: '#ef4444',
  lime: '#84cc16',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  indigo: '#5e61ef',
  magenta: '#d946ef',
};

/**
 * Чёрный или белый текст на фоне `#rrggbb` (или `#rrggbbaa` — поверх белой страницы) — тот, что контрастнее
 * (относительная яркость WCAG).
 */
function textOn(hex: string): string {
  const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = (parseInt(hex.slice(at, at + 2), 16) / 255) * alpha + (1 - alpha);

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179 ? '#ffffff' : '#111111';
}

/** `style` блока: выравнивание и фон (оттенок светлой темы: в экспорте переменных темы нет). */
export function alignStyle(block: BaseBlock, extra: readonly string[] = []): string {
  const align = block.props.alignment ?? block.props.align;
  const color = getBlockBackgroundColor(block);
  // У ячейки таблицы фон непрозрачный и насыщенный, текст на нём по контрасту — как в редакторе. Свой цвет блока — с той же
  // прозрачностью 35%, что и в редакторе (там он разбавлен, чтобы текст оставался читаемым).
  const cell =
    block.flavour === TABLE_CELL && color
      ? isHexColor(color)
        ? color
        : CELL_HEX[color]
      : undefined;
  const background = cell
    ? `${cell};color:${textOn(cell)}`
    : isHexColor(color)
      ? // Свой цвет с прозрачностью — как выбран; без неё — разбавлен до 35 %, как в редакторе.
        color.length === 9
        ? color
        : `${color}59`
      : exportColor(color, 'background');
  const style = [
    typeof align === 'string' && ALIGNED.has(align) && `text-align:${align}`,
    background && `background-color:${background}`,
    ...extra,
  ].filter(Boolean);

  return style.length > 0 ? ` style="${style.join(';')}"` : '';
}

const BORDER_PX = { thin: '1px', medium: '2px', thick: '3px' } as const;

/** Границы ячейки в `style`: толщина и цвет (оттенок светлой темы) по сторонам; «без линии» — `none`. */
/** Линия по умолчанию у ячейки таблицы в редакторе (`--inkbrick-stroke-2`, светлая тема). */
const DEFAULT_CELL_LINE = '#e9e9e7';

export function borderStyle(cell: BaseBlock, defaults = false): string[] {
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const key = (side: (typeof sides)[number]) => `border${side[0].toUpperCase()}${side.slice(1)}`;
  // Цвет и начертание стороны: свои у стороны, иначе общие на ячейку (сплошная, прерывистая или точками — как в редакторе).
  const look = (side: (typeof sides)[number]) => {
    const style = cell.props[`${key(side)}Style`] ?? cell.props.borderStyle;
    const color = cell.props[`${key(side)}Color`] ?? cell.props.borderColor;

    return {
      line: style === 'dashed' || style === 'dotted' ? style : 'solid',
      color: exportColor(color, 'text') ?? undefined,
    };
  };
  const plain = (side: (typeof sides)[number]) =>
    !['none', 'thin', 'medium', 'thick'].includes(String(cell.props[key(side)])) &&
    look(side).color === undefined &&
    look(side).line === 'solid';

  // Все четыре стороны без своих линий и оформления: одна запись вместо четырёх.
  if (defaults && sides.every(plain)) return [`border:1px solid ${DEFAULT_CELL_LINE}`];

  return sides.flatMap((side) => {
    const width = cell.props[key(side)];
    const { line, color } = look(side);

    if (width === 'none') return [`border-${side}:none`];

    if (width === 'thin' || width === 'medium' || width === 'thick')
      return [`border-${side}:${BORDER_PX[width]} ${line} ${color ?? '#bdbdbd'}`];

    // Сторона без своей толщины: в редакторе она рисуется линией таблицы по умолчанию (своего цвета, если он задан).
    if (!defaults) return [];

    return [`border-${side}:1px ${line} ${color ?? DEFAULT_CELL_LINE}`];
  });
}

/**
 * `style` ячейки таблицы для HTML вне редактора (экспорт, буфер обмена): выравнивание, фон с контрастным текстом и
 * границы по сторонам. `borders` — линии таблицы по умолчанию: с ними у сторон без своей толщины тоже рисуется линия.
 * Возвращает ` style="…"` или пустую строку.
 */
export function tableCellStyle(props: Readonly<Record<string, unknown>>, borders = false): string {
  const cell: BaseBlock = {
    id: '',
    flavour: TABLE_CELL,
    parentId: null,
    children: [],
    content: [],
    props: props as BaseBlock['props'],
  };

  return alignStyle(cell, borderStyle(cell, borders));
}

/** Насыщенные цвета фона ячеек по именам: те же, что в редакторе и в экспорте. */
export const TABLE_CELL_COLORS: Readonly<Record<string, string>> = CELL_HEX;
