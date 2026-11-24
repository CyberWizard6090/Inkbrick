/**
 * Подсветка синтаксиса кода без зависимостей и без DOM: строка и язык → токены (`HighlightToken`). Ею пользуется блок кода
 * редактора; подходит и для своего интерфейса, и для подсветки на сервере.
 */
export { HIGHLIGHT_LIMIT, highlightCode, normalizeLanguage } from './highlight';
export type { CodeHighlighter, HighlightToken, HighlightTokenType } from './types';
