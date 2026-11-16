import { TocSchema, type TocProps } from '@inkbrick/document';

import { defineBlock, type ReactBlockDefinition } from '../blocks/defineBlock';
import type { BlockComponent } from '../ui/types';
import { TocBlock } from './TocBlock';

export { TocBlock } from './TocBlock';
export { useHeadings } from './useHeadings';
export type { HeadingEntry } from './useHeadings';

/**
 * Оглавление: схема, отрисовка и пункт slash-меню. Подключается и к редактору, и к провайдеру:
 *
 * ```tsx
 * import { tocBlocks } from '@inkbrick/react';
 *
 * const editor = new Editor({ blocks: tocBlocks });
 *
 * <EditorProvider editor={editor} blocks={tocBlocks}>…
 * ```
 */
export const tocBlocks: readonly ReactBlockDefinition<any>[] = [
  defineBlock<TocProps>({
    schema: TocSchema,
    component: TocBlock as unknown as BlockComponent as never,
    controller: {
      slashItems: [
        {
          id: 'toc',
          title: 'Table of contents',
          description: 'Links to the headings of the document',
          keywords: ['toc', 'contents', 'outline'],
          icon: 'list',
        },
      ],
    },
  }),
];
