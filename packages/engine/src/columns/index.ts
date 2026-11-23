import { ColumnSchema, ColumnsSchema, type ColumnsProps } from '@inkbrick/document';

import type { AnyBlockDefinition, BlockDefinition } from '../controller/BlockController';
import type { EditorFeature } from '../feature';
import { collapseEmptyColumns, columnsCommands } from './columnsCommands';
import { MoveBlockToSideCommand } from './moveToSide';

export * from './columnsCommands';
export { MoveBlockToSideCommand } from './moveToSide';

// Блоки ссылаются на возможность, возможность — на блоки: объект собирается в два шага.
const feature: { -readonly [K in keyof EditorFeature]: EditorFeature[K] } = {
  name: 'columns',
  // Перенос блока вбок, в колонки (перетаскивание к краю блока).
  commands: [MoveBlockToSideCommand],
  // Колонка, оставшаяся без блоков, и колонки из одной колонки убираются после каждой команды.
  afterCommand: [collapseEmptyColumns],
};

export const columnsBlocks: readonly AnyBlockDefinition[] = [
  {
    schema: ColumnsSchema,
    controller: { commands: columnsCommands },
    feature,
  } as BlockDefinition<ColumnsProps>,
  { schema: ColumnSchema },
];

feature.blocks = columnsBlocks;

/** Колонки: блоки рядом, перенос блока вбок и уборка опустевших колонок. */
export const columnsFeature: EditorFeature = feature;
