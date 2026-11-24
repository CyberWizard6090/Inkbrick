import { FootnoteSchema, type FootnoteProps } from '@inkbrick/document';

import { defineBlock, type AnyReactBlockDefinition } from '../blocks/defineBlock';
import type { BlockComponent } from '../ui/types';
import type { SlashMenuItem } from '../slash/types';
import { canInsertFootnote, createFootnote } from './actions';
import { FootnoteBlock } from './FootnoteBlock';

export { FootnoteBlock } from './FootnoteBlock';
export { FootnoteIndex, getFootnoteIndex, documentBlocks } from '@inkbrick/engine/internal';
export type { FootnoteReference } from '@inkbrick/engine/internal';
export {
  insertFootnote,
  createFootnote,
  canInsertFootnote,
  goToFootnote,
  goToReference,
} from './actions';

/** Пункт slash-меню «Сноска»: вставляет ссылку на месте набранного «/» и создаёт текст сноски внизу. */
const footnoteSlashItem: SlashMenuItem = {
  id: 'footnote',
  group: 'advanced',
  title: 'Footnote',
  description: 'A numbered note at the end of the document',
  keywords: ['footnote', 'note', 'reference', 'citation'],
  flavour: 'block:footnote',
  run: ({ editor, blockId, offset }) => createFootnote(editor, blockId, offset),
  canRun: ({ editor, blockId }) => canInsertFootnote(editor, blockId),
};

/**
 * Сноски: схема текста сноски, его отрисовка и пункт slash-меню. Подключается и к редактору, и к провайдеру:
 *
 * ```tsx
 * import { footnoteBlocks } from '@inkbrick/react';
 *
 * const editor = new Editor({ blocks: footnoteBlocks });
 *
 * <EditorProvider editor={editor} blocks={footnoteBlocks}>…
 * ```
 */
export const footnoteBlocks: readonly AnyReactBlockDefinition[] = [
  defineBlock<FootnoteProps>({
    schema: FootnoteSchema,
    component: FootnoteBlock as unknown as BlockComponent as never,
    slashActions: [footnoteSlashItem],
  }),
];
