/**
 * Палитра цветов текста и подсветки. В документе хранится имя цвета (`color: 'red'`,
 * `backgroundColor: 'yellow'`): конкретный оттенок выбирает тема (`@inkbrick/styles`), поэтому текст читаем и в светлой,
 * и в тёмной теме. Произвольные CSS-цвета (`#ff0000`, `rgb(…)`) тоже допустимы, но от темы не зависят. Порядок имён —
 * порядок образцов в панелях: нейтральные, затем по кругу оттенков.
 */
export const COLOR_NAMES = [
  'black',
  'white',
  'gray',
  'brown',
  'orange',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'magenta',
  'pink',
  'red',
] as const;

export type ColorName = (typeof COLOR_NAMES)[number];

/** Цвета фона блока: названия цветов без чёрного и белого (они не дают читаемого фона в обеих темах). */
export const BLOCK_BACKGROUNDS = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'magenta',
  'pink',
  'red',
] as const;

export type BlockBackground = (typeof BLOCK_BACKGROUNDS)[number];

export const isBlockBackground = (value: unknown): value is BlockBackground =>
  typeof value === 'string' && (BLOCK_BACKGROUNDS as readonly string[]).includes(value);

export const isColorName = (value: unknown): value is ColorName =>
  typeof value === 'string' && (COLOR_NAMES as readonly string[]).includes(value);

/** Оттенки светлой темы — для экспорта, где CSS-переменных темы нет. */
export const COLOR_HEX: Readonly<Record<ColorName, { text: string; background: string }>> = {
  black: { text: '#000000', background: '#000000' },
  white: { text: '#ffffff', background: '#ffffff' },
  gray: { text: '#6b6b6b', background: '#d6d6d6' },
  brown: { text: '#a0592a', background: '#e3bf99' },
  orange: { text: '#f26a00', background: '#ffc58f' },
  yellow: { text: '#d49b00', background: '#ffe74a' },
  lime: { text: '#4d7c0f', background: '#d9f99d' },
  green: { text: '#1ea01e', background: '#96e396' },
  teal: { text: '#0f766e', background: '#99f6e4' },
  cyan: { text: '#0e7490', background: '#a5f3fc' },
  blue: { text: '#1473e6', background: '#94c8ff' },
  indigo: { text: '#4f46e5', background: '#c7d2fe' },
  purple: { text: '#8b3fe0', background: '#d0b4ff' },
  magenta: { text: '#c026d3', background: '#f5d0fe' },
  pink: { text: '#e5249b', background: '#ffb0e4' },
  red: { text: '#e5192b', background: '#ff9aa3' },
};

const CSS_COLOR = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]{3,20})$/i;

/** Свой цвет из выбора «Свой цвет…» (`<input type="color">`): ровно `#rrggbb`, ничего другого в фон блока не попадает. */
export const HEX_COLOR = /^#[\da-f]{6}$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR.test(value);

/** Фон блока из его props или `undefined`, если фона нет или значение не из набора (свой цвет — см. `getBlockBackgroundColor`). */
export const getBlockBackground = (block: {
  props: Readonly<Record<string, unknown>>;
}): BlockBackground | undefined =>
  isBlockBackground(block.props.background) ? block.props.background : undefined;

/** Любой допустимый фон блока: имя из палитры или свой цвет `#rrggbb`; иначе `undefined`. */
export const getBlockBackgroundColor = (block: {
  props: Readonly<Record<string, unknown>>;
}): string | undefined => {
  const value = block.props.background;

  return isBlockBackground(value) || isHexColor(value) ? value : undefined;
};

/** Безопасный CSS-цвет (hex, rgb/hsl, имя): без `url()`, `;` и прочего, что могло бы протащить стили. */
export function safeCssColor(value: unknown): string | null {
  return typeof value === 'string' && CSS_COLOR.test(value.trim()) ? value.trim() : null;
}

export function exportColor(value: unknown, kind: 'text' | 'background'): string | null {
  return isColorName(value) ? COLOR_HEX[value][kind] : safeCssColor(value);
}
