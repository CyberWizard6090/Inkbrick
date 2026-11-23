import { ColumnSchema, ColumnsSchema, type ColumnsProps } from '@inkbrick/document';
import { columnsCommands } from '@inkbrick/engine/internal';

import { defineBlock, type AnyReactBlockDefinition } from '../blocks/defineBlock';
import type { BlockComponent } from '../ui/types';
import { ColumnBlock } from './ColumnBlock';
import { ColumnsBlock } from './ColumnsBlock';

export { ColumnsBlock } from './ColumnsBlock';
export { ColumnBlock } from './ColumnBlock';

const view = (component: BlockComponent) => component as never;

/**
 * Колонки: схемы, команды, отрисовка и два пункта slash-меню (две и три колонки). Подключается и к редактору, и к провайдеру:
 *
 * ```tsx
 * import { columnsBlocks } from '@inkbrick/react';
 *
 * const editor = new Editor({ blocks: columnsBlocks });
 *
 * <EditorProvider editor={editor} blocks={columnsBlocks}>…
 * ```
 */
export const columnsBlocks: readonly AnyReactBlockDefinition[] = [
  defineBlock<ColumnsProps>({
    schema: ColumnsSchema,
    component: view(ColumnsBlock),
    controller: {
      commands: columnsCommands,
      slashItems: [
        {
          id: 'columns2',
          group: 'advanced',
          title: '2 columns',
          description: 'Two blocks side by side',
          keywords: ['columns', 'two'],
          icon: 'columns',
          props: { ratios: [1, 1] },
        },
        {
          id: 'columns3',
          group: 'advanced',
          title: '3 columns',
          description: 'Three blocks side by side',
          keywords: ['columns', 'three'],
          icon: 'columns',
          props: { ratios: [1, 1, 1] },
        },
      ],
    },
  }),
  defineBlock({ schema: ColumnSchema, component: view(ColumnBlock) }),
];
