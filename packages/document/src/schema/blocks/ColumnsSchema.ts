import * as z from '../zod';

import type { BaseBlock } from '../../model/BaseBlock';
import type { BlockSchema, BlockTemplate } from '../BlockSchema';

export const COLUMNS = 'block:columns';
export const COLUMN = 'block:column';

export const MAX_COLUMNS = 6;
export const DEFAULT_COLUMNS = 2;

export const columnsPropsSchema = z.object({
  /**
   * Доли ширины колонок по порядку (любые положительные числа, важно только отношение); недостающие — поровну.
   * Длина списка при создании задаёт число колонок.
   */
  ratios: z.array(z.number().positive()).optional(),
});

export type ColumnsProps = z.output<typeof columnsPropsSchema>;

export const columnPropsSchema = z.object({});

const column = (): BlockTemplate => ({
  flavour: COLUMN,
  children: [{ flavour: 'block:paragraph' }],
});

/**
 * Колонки: `block:columns` → колонки `block:column`, в каждой — обычные блоки (абзацы, списки, таблицы, картинки).
 * Колонок от двух до шести; для читающих и экспорта это обычная последовательность блоков.
 */
export const ColumnsSchema: BlockSchema<typeof columnsPropsSchema> = {
  flavour: COLUMNS,
  version: 1,
  name: 'Columns',
  icon: 'columns',

  role: 'hub',
  allowedParents: ['block:note'],
  allowedChildren: [COLUMN],
  inline: false,

  scaffold: (props) => {
    const count = Array.isArray(props.ratios) ? props.ratios.length : DEFAULT_COLUMNS;

    return Array.from({ length: Math.min(MAX_COLUMNS, Math.max(2, count)) }, column);
  },

  validate(block, getBlock) {
    const columns = block.children
      .map((id) => getBlock(id))
      .filter((item): item is BaseBlock => !!item);

    if (columns.length === 0) return [`columns "${block.id}" has no columns`];

    return columns
      .filter((item) => item.children.length === 0)
      .map((item) => `columns "${block.id}": column "${item.id}" is empty`);
  },

  repair(block, tree) {
    const fixes: string[] = [];

    if (block.children.length === 0) {
      const created = tree.append(block.id, COLUMN);

      tree.append(created.id, 'block:paragraph');
      fixes.push(`columns "${block.id}": added a missing column`);
    }

    for (const id of tree.get(block.id)!.children) {
      if ((tree.get(id)?.children.length ?? 1) === 0) {
        tree.append(id, 'block:paragraph');
        fixes.push(`columns "${block.id}": empty column "${id}" got a paragraph`);
      }
    }

    return fixes;
  },

  commands: [],
  shortcuts: [],
  rendererHint: 'columns-block',

  propsSchema: columnsPropsSchema,
};

export const ColumnSchema: BlockSchema<typeof columnPropsSchema> = {
  flavour: COLUMN,
  version: 1,
  name: 'Column',
  icon: 'columns',

  role: 'hub',
  allowedParents: [COLUMNS],
  allowedChildren: '*',
  inline: false,
  isolating: true,
  fillWhenEmpty: 'block:paragraph',

  commands: [],
  shortcuts: [],
  rendererHint: 'column-block',

  propsSchema: columnPropsSchema,
};

/**
 * Схемы колонок. Во встроенный набор не входят: подключаются явно —
 * `new Editor({ blocks: columnsBlocks })` из `@inkbrick/engine`.
 */
export const columnsBlockSchemas: readonly BlockSchema[] = [ColumnsSchema, ColumnSchema];
