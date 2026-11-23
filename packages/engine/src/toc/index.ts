import { TocSchema, type TocProps } from '@inkbrick/document';

import type { AnyBlockDefinition, BlockDefinition } from '../controller/BlockController';
import type { EditorFeature } from '../feature';

/**
 * Оглавление для редактора: схема блока `block:toc`. Во встроенный набор не входит — подключается явно:
 *
 * ```ts
 * const editor = new Editor({ blocks: tocBlocks });
 *
 * editor.dispatch({ type: 'insertBlock', payload: { flavour: 'block:toc', afterId } });
 * ```
 */
export const tocBlocks: readonly AnyBlockDefinition[] = [
  { schema: TocSchema } as BlockDefinition<TocProps>,
];

/** Оглавление: блок `toc` (`new Editor({ features: [tocFeature] })`). */
export const tocFeature: EditorFeature = { name: 'toc', blocks: tocBlocks };
