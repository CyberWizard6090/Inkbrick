import { TableCellSchema, TableRowSchema, TableSchema, type TableProps } from '@inkbrick/document';
import { tableCommands } from '@inkbrick/engine';

import { defineBlock, type ReactBlockDefinition } from '../blocks/defineBlock';
import type { BlockComponent } from '../ui/types';
import { TableBlock, TableCellBlock, TableRowBlock } from './TableBlock';
import { tableContextMenu } from './tableContextMenu';
import { tableKeymap } from './tableKeymap';

export { TableBlock, TableCellBlock, TableRowBlock } from './TableBlock';
export { tableKeymap } from './tableKeymap';
export { TableEditor } from './TableEditor';
export type { TableEditorProps } from './TableEditor';

const view = (component: BlockComponent) => component as never;

/**
 * Таблица целиком: схемы, команды строк и столбцов, отрисовка, пункт slash-меню и Tab между ячейками.
 * Подключается и к редактору, и к провайдеру:
 *
 * ```tsx
 * import { tableBlocks } from '@inkbrick/react';
 *
 * const editor = new Editor({ blocks: tableBlocks });
 *
 * <EditorProvider editor={editor} blocks={tableBlocks}>…
 * ```
 */
export const tableBlocks: readonly ReactBlockDefinition<any>[] = [
  defineBlock<TableProps>({
    schema: TableSchema,
    component: view(TableBlock),
    controller: {
      commands: tableCommands,
      slashItems: [
        {
          id: 'table',
          title: 'Table',
          description: 'Rows and columns of text',
          keywords: ['table', 'grid'],
          icon: 'table',
        },
      ],
    },
    keymap: tableKeymap,
    contextMenu: tableContextMenu,
  }),
  defineBlock({ schema: TableRowSchema, component: view(TableRowBlock) }),
  defineBlock({ schema: TableCellSchema, component: view(TableCellBlock) }),
];
