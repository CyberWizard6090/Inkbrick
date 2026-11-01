/**
 * Встроенная формула в тексте занимает в содержимом блока один символ — «объект» U+FFFC с атрибутом
 * `formula` (код LaTeX). Благодаря этому смещения, удаление, разделение и склейка блоков работают без особых случаев.
 */
export const FORMULA_CHAR = '\uFFFC';

/** Предел длины формулы (символов): защита от гигантских документов и тяжёлого разбора. */
export const MAX_FORMULA_LENGTH = 5000;

export const isFormulaNode = (node: { attributes?: Record<string, unknown> }): boolean =>
  typeof node.attributes?.formula === 'string';
