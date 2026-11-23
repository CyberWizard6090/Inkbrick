import { ToggleSchema, type ToggleProps } from '@inkbrick/document';

import type { AnyBlockDefinition, BlockDefinition } from '../controller/BlockController';

/**
 * Переключатель для редактора: схема блока `block:toggle`. Во встроенный набор не входит — подключается явно:
 *
 * ```ts
 * const editor = new Editor({ blocks: toggleBlocks });
 *
 * editor.dispatch({ type: 'insertBlock', payload: { flavour: 'block:toggle', afterId } });
 * editor.dispatch({ type: 'setBlockProps', payload: { blockId, props: { open: false } } });
 * ```
 */
export const toggleBlocks: readonly AnyBlockDefinition[] = [
  { schema: ToggleSchema } as BlockDefinition<ToggleProps>,
];
