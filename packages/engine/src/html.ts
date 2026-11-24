/**
 * `@inkbrick/engine/html`: разбор HTML (буфер обмена, импорт) во фрагмент документа. Те же функции есть в
 * `@inkbrick/engine`; отдельный вход нужен для ленивой загрузки: `import('@inkbrick/engine/html')` уводит разбор в свой
 * чанк, а не в общий с движком.
 */
export { embeddedFragment, htmlToFragment } from './clipboard/htmlToFragment';
export type { HtmlParser, HtmlToFragmentOptions } from './clipboard/htmlToFragment';
