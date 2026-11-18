/**
 * Разбор Markdown в документ — отдельная точка входа `@inkbrick/document/markdown`: в основной бандл
 * пакета (`@inkbrick/document`) парсер не входит, приложение подключает его, только когда нужен импорт.
 */
export { fromMarkdown } from './adapters/fromMarkdown';
export type { FromMarkdownOptions } from './adapters/fromMarkdown';
