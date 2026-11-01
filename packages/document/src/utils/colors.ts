/**
 * Палитра цветов текста и подсветки. В документе хранится имя цвета (`color: 'red'`,
 * `backgroundColor: 'yellow'`): конкретный оттенок выбирает тема (`@inkbrick/styles`), поэтому текст читаем и в светлой,
 * и в тёмной теме. Произвольные CSS-цвета (`#ff0000`, `rgb(…)`) тоже допустимы, но от темы не зависят.
 */
export const COLOR_NAMES = [
  'black',
  'white',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;

export type ColorName = (typeof COLOR_NAMES)[number];

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
  green: { text: '#1ea01e', background: '#96e396' },
  blue: { text: '#1473e6', background: '#94c8ff' },
  purple: { text: '#8b3fe0', background: '#d0b4ff' },
  pink: { text: '#e5249b', background: '#ffb0e4' },
  red: { text: '#e5192b', background: '#ff9aa3' },
};

const CSS_COLOR = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]{3,20})$/i;

/** Безопасный CSS-цвет (hex, rgb/hsl, имя): без `url()`, `;` и прочего, что могло бы протащить стили. */
export function safeCssColor(value: unknown): string | null {
  return typeof value === 'string' && CSS_COLOR.test(value.trim()) ? value.trim() : null;
}

export function exportColor(value: unknown, kind: 'text' | 'background'): string | null {
  return isColorName(value) ? COLOR_HEX[value][kind] : safeCssColor(value);
}
