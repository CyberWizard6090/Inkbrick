/**
 * Тип токена подсветки. Стандартные типы получают цвета из `@inkbrick/styles` (`--inkbrick-syntax-*`); свой подсветчик может
 * вернуть и любой другой тип — он попадёт в `data-inkbrick-token` как есть, и вы раскрасите его своим CSS.
 */
export type HighlightTokenType =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'function'
  | 'type'
  | 'constant'
  | 'builtin'
  | 'variable'
  | 'property'
  | 'tag'
  | 'attribute'
  | 'meta'
  | 'regex'
  | (string & {});

export interface HighlightToken {
  readonly from: number;
  readonly to: number;
  readonly type: HighlightTokenType;
}

/**
 * Подсветчик кода: по тексту и языку (`props.language` блока) возвращает токены. Результат не обязан быть
 * упорядоченным и не должен быть идеальным: пересечения, выход за границы и неверные типы отбрасываются, а текст
 * блока подсветка изменить не может. Встроенный подсветчик — `highlightCode`; подключить Shiki, Prism или
 * highlight.js можно, обернув их в такую функцию (`<EditorProvider highlighter={…}>`).
 */
export type CodeHighlighter = (code: string, language: string) => readonly HighlightToken[];
