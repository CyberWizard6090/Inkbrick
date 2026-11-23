import { FootnoteSchema, type FootnoteProps } from '@inkbrick/document';

import type { AnyBlockDefinition, BlockDefinition } from '../controller/BlockController';
import type { EditorFeature } from '../feature';

/**
 * Сноски для редактора: схема блока `block:footnote` (текст сноски). Во встроенный набор не входят — подключаются явно:
 *
 * ```ts
 * const editor = new Editor({ blocks: footnoteBlocks });
 * ```
 *
 * Ссылка в тексте — символ-объект с атрибутом `footnote` (код сноски); номер считается по порядку ссылок.
 */
export const footnoteBlocks: readonly AnyBlockDefinition[] = [
  { schema: FootnoteSchema } as BlockDefinition<FootnoteProps>,
];

/** Сноски: блок `footnote` (`new Editor({ features: [footnoteFeature] })`). */
export const footnoteFeature: EditorFeature = { name: 'footnote', blocks: footnoteBlocks };
