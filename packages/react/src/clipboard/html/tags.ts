export const MAX_DEPTH = 60;

export const SKIP_TAGS = new Set([
  'MATH',
  'SCRIPT',
  'STYLE',
  'HEAD',
  'TEMPLATE',
  'NOSCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'CANVAS',
  'IMG',
  'VIDEO',
  'AUDIO',
  'TITLE',
  'META',
  'LINK',
  'INPUT',
  'BUTTON',
  'SELECT',
  'TEXTAREA',
  'FORM',
]);

export const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'HR',
  'TABLE',
  'TR',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'MAIN',
  'ASIDE',
  'NAV',
  'FIGURE',
  'FIGCAPTION',
  'DL',
  'DT',
  'DD',
  'ADDRESS',
  'FIELDSET',
  'BODY',
  'HTML',
  'TBODY',
  'THEAD',
  'TFOOT',
  'CAPTION',
]);

/** Имя тега в верхнем регистре: у SVG/MathML элементов tagName строчный. */
export const tagOf = (element: Element): string => element.localName.toUpperCase();

export interface Style {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
}
